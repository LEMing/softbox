import * as THREE from 'three';
import { IGridStyle, IGridOptions } from './IGridStyle';
import { createShadowCatcher } from './shadowCatcher';
import { smoothstep01 } from '../../../utils/smoothstep';

const TEXTURE_REPEAT_METERS = 4;
const PHOTO_TEXTURE_REPEAT_METERS = 7;

const repeatMetersFor = (groundRadius: number, ceiling: number): number =>
  Math.min(Math.max(groundRadius / 10, 0.35), ceiling);
const PHOTO_BRIGHTNESS = new THREE.Color(1.55, 1.62, 1.72);
const DISC_FOOTPRINT_SCALE = 8;
const DISC_MAX_RADIUS_METERS = 70;
const FADE_START = 0.55;
const CONCRETE_COLOR = '#b6b3ac';
const MAP_SIZE = 512;
const CONCRETE_SEED = 0x5eedc0de;

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

const textureField =
  (sample: (u: number, v: number, period: number) => number) => (u: number, v: number) =>
    0.45 * sample(u, v, 32) + 0.3 * sample(u, v, 64) + 0.25 * sample(u, v, 128);

interface ConcretePbrMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

const NO_TILE_GLSL = `
vec3 softboxHash3(vec2 p) {
  return fract(sin(vec3(
    1.0 + dot(p, vec2(37.0, 17.0)),
    2.0 + dot(p, vec2(11.0, 47.0)),
    3.0 + dot(p, vec2(41.0, 29.0))
  )) * 103.0);
}
mat2 softboxRot(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}
vec4 softboxCellSample(sampler2D samp, vec2 uv, vec2 cell, vec2 ddxv, vec2 ddyv) {
  vec3 h = softboxHash3(cell);
  mat2 rotation = softboxRot(h.z * 6.2831853);
  return textureGrad(samp, rotation * uv + h.xy, rotation * ddxv, rotation * ddyv);
}
void softboxCellWeights(vec2 uv, out vec2 iuv, out vec4 weights) {
  vec2 t = smoothstep(0.25, 0.75, fract(uv));
  iuv = floor(uv);
  weights = vec4(
    (1.0 - t.x) * (1.0 - t.y),
    t.x * (1.0 - t.y),
    (1.0 - t.x) * t.y,
    t.x * t.y
  );
}
vec4 softboxTextureNoTile(sampler2D samp, vec2 uv) {
  vec2 iuv;
  vec4 w;
  softboxCellWeights(uv, iuv, w);
  vec2 ddxv = dFdx(uv);
  vec2 ddyv = dFdy(uv);
  vec4 mean = textureLod(samp, uv, 10.0);
  vec4 a = softboxCellSample(samp, uv, iuv, ddxv, ddyv) - mean;
  vec4 b = softboxCellSample(samp, uv, iuv + vec2(1.0, 0.0), ddxv, ddyv) - mean;
  vec4 c = softboxCellSample(samp, uv, iuv + vec2(0.0, 1.0), ddxv, ddyv) - mean;
  vec4 d = softboxCellSample(samp, uv, iuv + vec2(1.0, 1.0), ddxv, ddyv) - mean;
  vec4 blended = mean + (w.x * a + w.y * b + w.z * c + w.w * d) * inversesqrt(dot(w, w));
  return clamp(blended, 0.0, 1.0);
}
vec3 softboxNormalCellSample(sampler2D samp, vec2 uv, vec2 cell, vec2 ddxv, vec2 ddyv) {
  vec3 h = softboxHash3(cell);
  float angle = h.z * 6.2831853;
  mat2 rotation = softboxRot(angle);
  vec3 mapN = textureGrad(samp, rotation * uv + h.xy, rotation * ddxv, rotation * ddyv).xyz * 2.0 - 1.0;
  mapN.xy = softboxRot(-angle) * mapN.xy;
  return mapN;
}
vec3 softboxNormalNoTile(sampler2D samp, vec2 uv) {
  vec2 iuv;
  vec4 w;
  softboxCellWeights(uv, iuv, w);
  vec2 ddxv = dFdx(uv);
  vec2 ddyv = dFdy(uv);
  vec3 flat3 = vec3(0.0, 0.0, 1.0);
  vec3 a = softboxNormalCellSample(samp, uv, iuv, ddxv, ddyv) - flat3;
  vec3 b = softboxNormalCellSample(samp, uv, iuv + vec2(1.0, 0.0), ddxv, ddyv) - flat3;
  vec3 c = softboxNormalCellSample(samp, uv, iuv + vec2(0.0, 1.0), ddxv, ddyv) - flat3;
  vec3 d = softboxNormalCellSample(samp, uv, iuv + vec2(1.0, 1.0), ddxv, ddyv) - flat3;
  return normalize(
    flat3 + (w.x * a + w.y * b + w.z * c + w.w * d) * inversesqrt(dot(w, w))
  );
}
`;

const NO_TILE_MAP_FRAGMENT = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = softboxTextureNoTile( map, vMapUv );
  diffuseColor *= sampledDiffuseColor;
#endif
`;
const NO_TILE_NORMAL_FRAGMENT = `
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 mapN = softboxNormalNoTile( normalMap, vNormalMapUv );
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );
#endif
`;
const NO_TILE_ROUGHNESS_FRAGMENT = `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 texelRoughness = softboxTextureNoTile( roughnessMap, vRoughnessMapUv );
  roughnessFactor *= texelRoughness.g;
#endif
`;

const installUntiledSampling = (material: THREE.MeshStandardMaterial): void => {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NO_TILE_GLSL}`)
      .replace('#include <map_fragment>', NO_TILE_MAP_FRAGMENT)
      .replace('#include <normal_fragment_maps>', NO_TILE_NORMAL_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', NO_TILE_ROUGHNESS_FRAGMENT);
  };
};

interface ConcretePixelBuffers {
  albedo: Uint8ClampedArray;
  normal: Uint8ClampedArray;
  roughness: Uint8ClampedArray;
}

let cachedPixels: ConcretePixelBuffers | null = null;

const generateConcretePixels = (): ConcretePixelBuffers => {
  const random = mulberry32(CONCRETE_SEED);
  const noise = textureField(makeTileableNoise(random));
  const height = new Float32Array(MAP_SIZE * MAP_SIZE);
  for (let y = 0; y < MAP_SIZE; y += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      height[y * MAP_SIZE + x] = noise(x / MAP_SIZE, y / MAP_SIZE);
    }
  }
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

      const tone = 0.91 + h * 0.18 + (random() - 0.5) * 0.03;
      albedo[i] = Math.min(255, base.r * 255 * tone);
      albedo[i + 1] = Math.min(255, base.g * 255 * tone);
      albedo[i + 2] = Math.min(255, base.b * 255 * tone);
      albedo[i + 3] = 255;

      const dx = (heightAt(x + 1, y) - heightAt(x - 1, y)) * NORMAL_STRENGTH;
      const dy = (heightAt(x, y + 1) - heightAt(x, y - 1)) * NORMAL_STRENGTH;
      const inverseLength = 1 / Math.hypot(dx, dy, 1);
      normal[i] = (-dx * inverseLength * 0.5 + 0.5) * 255;
      normal[i + 1] = (-dy * inverseLength * 0.5 + 0.5) * 255;
      normal[i + 2] = (inverseLength * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;

      const rough = (0.86 + h * 0.12) * 255;
      roughness[i] = rough;
      roughness[i + 1] = rough;
      roughness[i + 2] = rough;
      roughness[i + 3] = 255;
    }
  }
  return { albedo, normal, roughness };
};

export class ConcreteDiscGrid implements IGridStyle {
  name = 'Concrete Disc';

  createGrid(options: IGridOptions): THREE.Object3D {
    const group = new THREE.Group();
    const footprint = Math.max(options.size || 1, 1);
    const radius = Math.min(footprint * DISC_FOOTPRINT_SCALE, DISC_MAX_RADIUS_METERS);
    const makeMaterial = (transparent: boolean) => {
      const material = new THREE.MeshStandardMaterial({
        color: CONCRETE_COLOR,
        roughness: 0.95,
        metalness: 0,
        transparent,
        vertexColors: true,
      });
      installUntiledSampling(material);
      return material;
    };
    const materials = [makeMaterial(false), makeMaterial(true)];
    if (options.styleOptions?.texture) {
      this.applyPhotoMaps(materials, radius, options.styleOptions);
    } else {
      this.applyProceduralMaps(materials, radius);
    }
    const fadeStart = radius * FADE_START;

    const core = new THREE.Mesh(this.createGroundGeometry(radius, 0, fadeStart), materials[0]);
    core.rotation.x = -Math.PI / 2;
    core.receiveShadow = true;
    group.add(core);

    const ring = new THREE.Mesh(
      this.createGroundGeometry(radius, fadeStart, radius),
      materials[1]
    );
    ring.rotation.x = -Math.PI / 2;
    ring.receiveShadow = true;
    ring.renderOrder = -1;
    group.add(ring);

    group.add(createShadowCatcher(footprint * 1.5));
    return group;
  }

  private applyPhotoMaps(
    materials: THREE.MeshStandardMaterial[],
    radius: number,
    styleOptions: NonNullable<IGridOptions['styleOptions']>
  ): void {
    const loader = new THREE.TextureLoader();
    const repeats = (radius * 2) / repeatMetersFor(radius, PHOTO_TEXTURE_REPEAT_METERS);
    let failedOver = false;
    const failover = () => {
      if (failedOver) {
        return;
      }
      failedOver = true;
      if (materials.every((material) => material.userData.softboxDisposed)) {
        return;
      }
      for (const material of materials) {
        material.map?.dispose();
        material.normalMap?.dispose();
        material.roughnessMap?.dispose();
        material.map = null;
        material.normalMap = null;
        material.roughnessMap = null;
        material.color = new THREE.Color(CONCRETE_COLOR);
        material.roughness = 0.95;
        material.needsUpdate = true;
      }
      this.applyProceduralMaps(materials, radius);
    };
    const load = (url: string, isColor: boolean): THREE.Texture => {
      const texture = loader.load(url, undefined, undefined, failover);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeats, repeats);
      texture.anisotropy = 4;
      if (isColor) {
        texture.colorSpace = THREE.SRGBColorSpace;
      }
      return texture;
    };
    const map = load(styleOptions.texture as string, true);
    const normalMap = styleOptions.normalMap ? load(styleOptions.normalMap, false) : null;
    const roughnessMap = styleOptions.roughnessMap ? load(styleOptions.roughnessMap, false) : null;
    for (const material of materials) {
      material.map = map;
      if (normalMap) {
        material.normalMap = normalMap;
        material.normalScale = new THREE.Vector2(0.9, 0.9);
      }
      if (roughnessMap) {
        material.roughnessMap = roughnessMap;
      }
      material.color = PHOTO_BRIGHTNESS.clone();
      material.roughness = 1;
    }
  }

  private applyProceduralMaps(materials: THREE.MeshStandardMaterial[], radius: number): void {
    const maps = this.createConcretePbrMaps();
    if (!maps) {
      return;
    }
    const repeats = (radius * 2) / repeatMetersFor(radius, TEXTURE_REPEAT_METERS);
    for (const texture of [maps.map, maps.normalMap, maps.roughnessMap]) {
      texture.repeat.set(repeats, repeats);
    }
    for (const material of materials) {
      material.map = maps.map;
      material.normalMap = maps.normalMap;
      material.normalScale = new THREE.Vector2(0.6, 0.6);
      material.roughnessMap = maps.roughnessMap;
      material.color = new THREE.Color('#ffffff');
      material.roughness = 1;
    }
  }

  private createGroundGeometry(
    fullRadius: number,
    innerRadius: number,
    outerRadius: number
  ): THREE.BufferGeometry {
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 128, 32);
    const macro = makeTileableNoise(mulberry32(CONCRETE_SEED ^ 0x9e3779b9));
    const positions = geometry.getAttribute('position');
    const rgba = new Float32Array(positions.count * 4);
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const r = Math.hypot(x, y) / fullRadius;
      const fade =
        r <= FADE_START ? 1 : 1 - smoothstep01(Math.min((r - FADE_START) / (1 - FADE_START), 1));
      const u = x / (fullRadius * 2) + 0.5;
      const v = y / (fullRadius * 2) + 0.5;
      const drift = 0.9 + (0.6 * macro(u, v, 4) + 0.4 * macro(u, v, 32)) * 0.2;
      rgba[i * 4] = drift;
      rgba[i * 4 + 1] = drift;
      rgba[i * 4 + 2] = drift;
      rgba[i * 4 + 3] = fade;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
    return geometry;
  }

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
      texture.anisotropy = 4;
      return texture;
    });
    albedoMap.colorSpace = THREE.SRGBColorSpace;
    return { map: albedoMap, normalMap, roughnessMap };
  }

  dispose(): void {
  }
}
