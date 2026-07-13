import * as THREE from 'three';
import { IGridStyle, IGridOptions } from './IGridStyle';
import { createShadowCatcher } from './shadowCatcher';
import { smoothstep01 } from '../../../utils/smoothstep';

/** Meters of ground one repeat of the procedural concrete covers. */
const TEXTURE_REPEAT_METERS = 4;
/** How far the ground reads past the model (its largest footprint dimension). */
const DISC_FOOTPRINT_SCALE = 8;
/** Hard cap on the ground radius: the rim fade must complete INSIDE the
 * ground-projected skybox (default world radius 120m — see
 * core/groundProjection), or a big model's still-opaque concrete would slice
 * through the projected world's walls. */
const DISC_MAX_RADIUS_METERS = 70;
/** Fraction of the disc radius where the rim fade-out begins. */
const FADE_START = 0.55;
const CONCRETE_COLOR = '#b6b3ac';
/** Texture resolution; one texel ≈ 12mm of ground at the default repeat. */
const MAP_SIZE = 512;
/** Fixed PRNG seed: the concrete looks identical every session (and in every
 * test) instead of reshuffling per page load. */
const CONCRETE_SEED = 0x5eedc0de;

/** Deterministic PRNG (mulberry32) so the generated surface is stable. */
const mulberry32 = (seed: number) => {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Periodic (tileable) multi-octave value noise sampled on a wrapped lattice —
 * the texture tiles seamlessly, so the repeat across the disc has no visible
 * seams. Returns a height field in [0, 1].
 */
const makeTileableNoise = (random: () => number) => {
  const LATTICE = 128;
  const lattice = new Float32Array(LATTICE * LATTICE);
  for (let i = 0; i < lattice.length; i += 1) {
    lattice[i] = random();
  }
  const at = (x: number, y: number, period: number) => {
    const step = LATTICE / period;
    const gx = ((x % period) + period) % period;
    const gy = ((y % period) + period) % period;
    // Floor the lattice indices: a period that doesn't divide LATTICE would
    // otherwise index the array at a fraction — undefined → NaN → a black
    // disc (vertex colors poison the whole draw).
    const ix = Math.floor(gx * step) % LATTICE;
    const iy = Math.floor(gy * step) % LATTICE;
    return lattice[iy * LATTICE + ix];
  };
  const sample = (u: number, v: number, period: number) => {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smoothstep01(x - x0);
    const ty = smoothstep01(y - y0);
    const a = at(x0, y0, period);
    const b = at(x0 + 1, y0, period);
    const c = at(x0, y0 + 1, period);
    const d = at(x0 + 1, y0 + 1, period);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  return sample;
};

/**
 * The TILED texture field carries only HIGH-frequency content (features
 * ≤ ~12cm of ground): the eye cannot match fine grain between repeats, so
 * the tiling is undetectable. Anything larger would form a recognizable
 * motif that visibly repeats across the disc — that job belongs to the
 * per-vertex macro layer, which never repeats at all.
 */
const textureField =
  (sample: (u: number, v: number, period: number) => number) => (u: number, v: number) =>
    0.45 * sample(u, v, 32) + 0.3 * sample(u, v, 64) + 0.25 * sample(u, v, 128);

interface ConcretePbrMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

interface ConcretePixelBuffers {
  albedo: Uint8ClampedArray;
  normal: Uint8ClampedArray;
  roughness: Uint8ClampedArray;
}

/** Session cache of the generated pixels — pure function of the fixed seed. */
let cachedPixels: ConcretePixelBuffers | null = null;

/** Compute the albedo/normal/roughness pixels from the seeded height field. */
const generateConcretePixels = (): ConcretePixelBuffers => {
  const random = mulberry32(CONCRETE_SEED);
  const noise = textureField(makeTileableNoise(random));
  const height = new Float32Array(MAP_SIZE * MAP_SIZE);
  for (let y = 0; y < MAP_SIZE; y += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      height[y * MAP_SIZE + x] = noise(x / MAP_SIZE, y / MAP_SIZE);
    }
  }
  // Sparse speckle pits — tiny darker dents that read as aggregate.
  const PITS = 900;
  for (let i = 0; i < PITS; i += 1) {
    const x = Math.floor(random() * MAP_SIZE);
    const y = Math.floor(random() * MAP_SIZE);
    const depth = 0.12 + random() * 0.2;
    height[y * MAP_SIZE + x] = Math.max(0, height[y * MAP_SIZE + x] - depth);
  }

  const heightAt = (x: number, y: number) =>
    height[((y + MAP_SIZE) % MAP_SIZE) * MAP_SIZE + ((x + MAP_SIZE) % MAP_SIZE)];

  const base = new THREE.Color(CONCRETE_COLOR);
  const albedo = new Uint8ClampedArray(MAP_SIZE * MAP_SIZE * 4);
  const normal = new Uint8ClampedArray(MAP_SIZE * MAP_SIZE * 4);
  const roughness = new Uint8ClampedArray(MAP_SIZE * MAP_SIZE * 4);
  const NORMAL_STRENGTH = 2.4;
  for (let y = 0; y < MAP_SIZE; y += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      const i = (y * MAP_SIZE + x) * 4;
      const h = heightAt(x, y);

      // Albedo: base tone modulated ±9% by the field + fine grain.
      const tone = 0.91 + h * 0.18 + (random() - 0.5) * 0.03;
      albedo[i] = Math.min(255, base.r * 255 * tone);
      albedo[i + 1] = Math.min(255, base.g * 255 * tone);
      albedo[i + 2] = Math.min(255, base.b * 255 * tone);
      albedo[i + 3] = 255;

      // Tangent-space normal from central differences (wrapped — tileable).
      const dx = (heightAt(x + 1, y) - heightAt(x - 1, y)) * NORMAL_STRENGTH;
      const dy = (heightAt(x, y + 1) - heightAt(x, y - 1)) * NORMAL_STRENGTH;
      const inverseLength = 1 / Math.hypot(dx, dy, 1);
      normal[i] = (-dx * inverseLength * 0.5 + 0.5) * 255;
      normal[i + 1] = (-dy * inverseLength * 0.5 + 0.5) * 255;
      normal[i + 2] = (inverseLength * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;

      // Roughness: matte everywhere, the low (darker, denser) areas a touch
      // smoother — reads as subtly polished troughs. Green channel is what
      // three samples.
      const rough = (0.86 + h * 0.12) * 255;
      roughness[i] = rough;
      roughness[i + 1] = rough;
      roughness[i + 2] = rough;
      roughness[i + 3] = 255;
    }
  }
  return { albedo, normal, roughness };
};

/**
 * A large matte concrete ground disc for outdoor scenes. Unlike the studio
 * shadow floor this is a real, visible surface — physical in BOTH the raster
 * view and the path tracer, so it deliberately carries NO tracer-only dome
 * (`PATH_TRACING_FLOOR_FLAG`): an enclosing dome would occlude the HDRI
 * environment the outdoor scenes light with. A `ShadowMaterial` catcher rides
 * just above the concrete so the baked soft contact shadow composites over it
 * (the disc surface stays at y=0 — the catcher lift keeps them clear; an
 * upward-extruded ground is what buried the shadow on the stone tiles).
 *
 * The concrete is PROCEDURAL PBR — albedo, normal and roughness maps are all
 * derived from one seeded, tileable multi-octave noise field (zero network
 * requests, seamless tiling, identical every session). The normal map is the
 * realism carrier: grazing light catches real micro-relief instead of a flat
 * painted plane. The rim fades out via RGBA vertex colors so the ground
 * dissolves into the environment's own floor instead of ending in a hard
 * "table edge" horizon line. Where a 2D canvas context is unavailable
 * (jsdom) it falls back to a flat matte material — the scene degrades
 * gracefully instead of failing.
 */
export class ConcreteDiscGrid implements IGridStyle {
  name = 'Concrete Disc';

  createGrid(options: IGridOptions): THREE.Object3D {
    const group = new THREE.Group();
    const footprint = Math.max(options.size || 1, 1);
    group.add(
      this.createDisc(Math.min(footprint * DISC_FOOTPRINT_SCALE, DISC_MAX_RADIUS_METERS))
    );
    // Catcher sized like the studio floor's: the baked shadow clips itself to
    // this disc, and the shadow never spreads anywhere near the ground's edge.
    group.add(createShadowCatcher(footprint * 1.5));
    return group;
  }

  private createDisc(radius: number): THREE.Mesh {
    const material = new THREE.MeshStandardMaterial({
      color: CONCRETE_COLOR,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      vertexColors: true,
    });
    const maps = this.createConcretePbrMaps();
    if (maps) {
      const repeats = (radius * 2) / TEXTURE_REPEAT_METERS;
      for (const texture of [maps.map, maps.normalMap, maps.roughnessMap]) {
        texture.repeat.set(repeats, repeats);
      }
      material.map = maps.map;
      material.normalMap = maps.normalMap;
      material.normalScale = new THREE.Vector2(0.6, 0.6);
      material.roughnessMap = maps.roughnessMap;
      // The maps carry tone and roughness; the scalars must not double-apply.
      material.color = new THREE.Color('#ffffff');
      material.roughness = 1;
    }
    const disc = new THREE.Mesh(this.createFadingDiscGeometry(radius), material);
    disc.rotation.x = -Math.PI / 2;
    disc.receiveShadow = true;
    return disc;
  }

  /**
   * A disc with radial segments carrying RGBA vertex colors doing two jobs:
   * - alpha: fully opaque around the model, easing to transparent at the rim,
   *   so the concrete dissolves into the environment instead of showing a
   *   hard horizon edge;
   * - rgb: a low-frequency tonal drift across the WHOLE disc. The texture
   *   necessarily repeats every few meters — this macro layer never repeats,
   *   which is what stops the eye from locking onto the tile period.
   */
  private createFadingDiscGeometry(radius: number): THREE.BufferGeometry {
    // Dense segments: the macro drift below is per-vertex, so vertex spacing
    // is its effective resolution (~1m at the capped radius).
    const geometry = new THREE.RingGeometry(0, radius, 128, 48);
    const macro = makeTileableNoise(mulberry32(CONCRETE_SEED ^ 0x9e3779b9));
    const positions = geometry.getAttribute('position');
    const rgba = new Float32Array(positions.count * 4);
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const r = Math.hypot(x, y) / radius;
      const fade =
        r <= FADE_START ? 1 : 1 - smoothstep01(Math.min((r - FADE_START) / (1 - FADE_START), 1));
      // ALL visible patchiness lives here, in two scales spanning the disc
      // (a broad wash + meter-scale mottling) — the macro period covers the
      // whole ground exactly once, so unlike the tiled texture this layer
      // cannot repeat, and there is no motif left for the eye to track.
      const u = x / (radius * 2) + 0.5;
      const v = y / (radius * 2) + 0.5;
      const drift = 0.9 + (0.6 * macro(u, v, 4) + 0.4 * macro(u, v, 32)) * 0.2;
      rgba[i * 4] = drift;
      rgba[i * 4 + 1] = drift;
      rgba[i * 4 + 2] = drift;
      rgba[i * 4 + 3] = fade;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
    return geometry;
  }

  /**
   * All three PBR maps from one seeded height field. The PIXELS are a pure
   * function of the fixed seed, so they are computed once per session
   * (`cachedPixels`) — regenerating ~786k pixel writes on every structural
   * rebuild was measurable main-thread jank. The CANVASES AND TEXTURES are
   * fresh per grid (never cached on the factory singleton) so canonical scene
   * disposal frees them without ever handing a later grid a disposed texture.
   */
  private createConcretePbrMaps(): ConcretePbrMaps | null {
    if (typeof document === 'undefined') {
      return null;
    }
    const canvases: HTMLCanvasElement[] = [];
    const contexts: CanvasRenderingContext2D[] = [];
    for (let i = 0; i < 3; i += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = MAP_SIZE;
      canvas.height = MAP_SIZE;
      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }
      canvases.push(canvas);
      contexts.push(context);
    }

    cachedPixels ??= generateConcretePixels();
    const buffers = [cachedPixels.albedo, cachedPixels.normal, cachedPixels.roughness];
    contexts.forEach((context, index) => {
      const imageData = context.createImageData(MAP_SIZE, MAP_SIZE);
      imageData.data.set(buffers[index]);
      context.putImageData(imageData, 0, 0);
    });

    const [albedoMap, normalMap, roughnessMap] = canvases.map((canvas) => {
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      // The ground is viewed at grazing angles; without anisotropy the mip
      // chain smears the grain into banding toward the horizon.
      texture.anisotropy = 4;
      return texture;
    });
    albedoMap.colorSpace = THREE.SRGBColorSpace;
    return { map: albedoMap, normalMap, roughnessMap };
  }

  dispose(): void {
    // Textures are owned per-grid (see createConcretePbrMaps) and freed by
    // canonical scene disposal; the singleton retains nothing.
  }
}
