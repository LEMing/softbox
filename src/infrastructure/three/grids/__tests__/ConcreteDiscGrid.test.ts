import * as THREE from 'three';
import { ConcreteDiscGrid } from '../ConcreteDiscGrid';
import { GridFactory } from '../GridFactory';
import { GridType, IGridOptions } from '../IGridStyle';
import {
  CONTACT_SHADOW_HELPER_FLAG,
  CONTACT_SHADOW_LIVE_NAME,
  PATH_TRACING_FLOOR_FLAG,
} from '../../ContactShadowBaker';

const options = (size = 10): IGridOptions => ({ size, divisions: 3 });

const groundMeshesOf = (grid: THREE.Object3D): THREE.Mesh[] =>
  grid.children.filter(
    (child) => (child as THREE.Mesh).isMesh && child.name !== CONTACT_SHADOW_LIVE_NAME
  ) as THREE.Mesh[];

/** The OPAQUE inner ground under the model. */
const discOf = (grid: THREE.Object3D): THREE.Mesh =>
  groundMeshesOf(grid).find(
    (mesh) => !(mesh.material as THREE.Material).transparent
  ) as THREE.Mesh;

/** The transparent rim-fade ring. */
const ringOf = (grid: THREE.Object3D): THREE.Mesh =>
  groundMeshesOf(grid).find(
    (mesh) => (mesh.material as THREE.Material).transparent
  ) as THREE.Mesh;

const catcherOf = (grid: THREE.Object3D): THREE.Mesh =>
  grid.getObjectByName(CONTACT_SHADOW_LIVE_NAME) as THREE.Mesh;

/** A minimal 2D-context stub — jsdom has no canvas implementation. */
const stubCanvasContext = () => {
  const context = {
    createImageData: jest.fn((width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    })),
    putImageData: jest.fn(),
  };
  return jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
};

describe('ConcreteDiscGrid', () => {
  it('builds a visible matte ground (opaque core + fade ring) plus a shadow catcher', () => {
    const grid = new ConcreteDiscGrid().createGrid(options());

    const disc = discOf(grid);
    expect(disc.visible).toBe(true);
    expect(disc.receiveShadow).toBe(true);
    expect(disc.castShadow).toBe(false);
    expect(disc.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(disc.position.y).toBe(0);
    const material = disc.material as THREE.MeshStandardMaterial;
    expect(material.roughness).toBeGreaterThanOrEqual(0.9);
    expect(material.metalness).toBe(0);
    // The core must stay OUT of the transparent queue: a transparent ground
    // sorted after a model's glass overwrote the glass shading (the
    // vanished-windshield bug). Only the rim-fade ring is transparent, and
    // it draws first among transparents.
    expect(material.transparent).toBe(false);
    const ring = ringOf(grid);
    expect(ring).toBeDefined();
    expect(ring.renderOrder).toBe(-1);

    const catcher = catcherOf(grid);
    expect(catcher).toBeDefined();
    expect(catcher.userData[CONTACT_SHADOW_HELPER_FLAG]).toBe(true);
    expect((catcher.material as THREE.ShadowMaterial).isShadowMaterial).toBe(true);
    // Above the concrete surface, so the shadow composites over it.
    expect(catcher.position.y).toBeGreaterThan(0);
  });

  it('carries NO tracer-only dome — one would occlude the HDRI environment in PT mode', () => {
    const grid = new ConcreteDiscGrid().createGrid(options());
    const flagged: THREE.Object3D[] = [];
    grid.traverse((child) => {
      if (child.userData?.[PATH_TRACING_FLOOR_FLAG]) {
        flagged.push(child);
      }
    });
    expect(flagged).toEqual([]);
  });

  it('sizes the ground well past the model and the catcher near it', () => {
    const grid = new ConcreteDiscGrid().createGrid(options(10));
    const groundRadius = (ringOf(grid).geometry as THREE.RingGeometry).parameters.outerRadius;
    const catcherRadius = (catcherOf(grid).geometry as THREE.CircleGeometry).parameters.radius;
    // Ground reads as open terrain; the baked shadow clips to the catcher.
    expect(groundRadius).toBeGreaterThanOrEqual(10 * 4);
    expect(catcherRadius).toBeLessThan(groundRadius);
    expect(catcherRadius).toBeGreaterThanOrEqual(10);
    // The core and ring meet exactly (no gap, no overlap).
    const coreOuter = (discOf(grid).geometry as THREE.RingGeometry).parameters.outerRadius;
    const ringInner = (ringOf(grid).geometry as THREE.RingGeometry).parameters.innerRadius;
    expect(coreOuter).toBeCloseTo(ringInner);
  });

  it('vertex colors are always finite — one NaN paints the whole ground black', () => {
    // Regression: macro-noise periods that do not divide the lattice indexed
    // the array at a fraction (undefined → NaN vertex colors → black ground).
    const grid = new ConcreteDiscGrid().createGrid(options(10));
    for (const mesh of groundMeshesOf(grid)) {
      const values = mesh.geometry.getAttribute('color').array as Float32Array;
      const firstBad = values.findIndex((value) => !Number.isFinite(value));
      expect(firstBad).toBe(-1);
    }
  });

  it('caps the ground radius inside the projected world (large models)', () => {
    const grid = new ConcreteDiscGrid().createGrid(options(20));
    const groundRadius = (ringOf(grid).geometry as THREE.RingGeometry).parameters.outerRadius;
    // 20m footprint × 8 would be 160m — through the 120m projection wall. The
    // cap keeps the whole rim fade inside the projected world.
    expect(groundRadius).toBeLessThanOrEqual(70);
  });

  it('fades the rim out via RGBA vertex colors — no hard horizon edge', () => {
    const grid = new ConcreteDiscGrid().createGrid(options(10));
    const ring = ringOf(grid);
    const geometry = ring.geometry as THREE.BufferGeometry;
    const color = geometry.getAttribute('color');
    const position = geometry.getAttribute('position');
    expect(color.itemSize).toBe(4);
    const outerRadius = (geometry as THREE.RingGeometry).parameters.outerRadius;
    let rimAlpha = -1;
    for (let i = 0; i < position.count; i += 1) {
      const r = Math.hypot(position.getX(i), position.getY(i)) / outerRadius;
      if (r > 0.99) rimAlpha = color.getW(i);
    }
    expect(rimAlpha).toBeLessThan(0.02);
    expect((ring.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);

    // The opaque core is fully opaque everywhere (alpha carries no fade).
    const coreColors = discOf(grid).geometry.getAttribute('color');
    for (let i = 0; i < coreColors.count; i += 1) {
      expect(coreColors.getW(i)).toBe(1);
    }
  });

  it('falls back to a flat matte color when no 2D canvas context exists (jsdom)', () => {
    const grid = new ConcreteDiscGrid().createGrid(options());
    const material = discOf(grid).material as THREE.MeshStandardMaterial;
    expect(material.map).toBeNull();
    // The base color carries the concrete tone in the fallback.
    expect(material.color.getHexString()).not.toBe('ffffff');
  });

  it('bakes a full procedural PBR set (albedo + normal + roughness) when a 2D context exists', () => {
    const getContext = stubCanvasContext();
    try {
      const grid = new ConcreteDiscGrid().createGrid(options(10));
      const material = discOf(grid).material as THREE.MeshStandardMaterial;
      expect(material.map).not.toBeNull();
      // The normal map is the realism carrier — grazing light needs relief.
      expect(material.normalMap).not.toBeNull();
      expect(material.roughnessMap).not.toBeNull();
      for (const map of [material.map!, material.normalMap!, material.roughnessMap!]) {
        expect(map.wrapS).toBe(THREE.RepeatWrapping);
        expect(map.wrapT).toBe(THREE.RepeatWrapping);
        // Repeats scale with the ground size (world-scale grain, not stretched).
        expect(map.repeat.x).toBeGreaterThan(1);
      }
      // Only the albedo is color data; data maps must stay linear.
      expect(material.map!.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(material.normalMap!.colorSpace).not.toBe(THREE.SRGBColorSpace);
      // The maps carry tone/roughness; the scalars must not double-apply.
      expect(material.color.getHexString()).toBe('ffffff');
      expect(material.roughness).toBe(1);
    } finally {
      getContext.mockRestore();
    }
  });

  it('owns a fresh texture per grid, even through the GridFactory singleton', () => {
    const getContext = stubCanvasContext();
    try {
      const a = discOf(GridFactory.createGrid(GridType.CONCRETE_DISC, options()));
      const b = discOf(GridFactory.createGrid(GridType.CONCRETE_DISC, options()));
      expect((a.material as THREE.MeshStandardMaterial).map).not.toBe(
        (b.material as THREE.MeshStandardMaterial).map
      );
    } finally {
      getContext.mockRestore();
    }
  });

  describe('photographic maps (styleOptions URLs)', () => {
    let loadSpy: jest.SpyInstance;
    let errorCallbacks: Array<(event: unknown) => void>;

    beforeEach(() => {
      errorCallbacks = [];
      loadSpy = jest
        .spyOn(THREE.TextureLoader.prototype, 'load')
        .mockImplementation((_url, _onLoad, _onProgress, onError) => {
          if (onError) errorCallbacks.push(onError);
          return new THREE.Texture();
        });
    });

    afterEach(() => loadSpy.mockRestore());

    const photoOptions = (): IGridOptions => ({
      size: 10,
      divisions: 3,
      styleOptions: {
        texture: 'https://cdn/diff.jpg',
        normalMap: 'https://cdn/nor.jpg',
        roughnessMap: 'https://cdn/rough.jpg',
      },
    });

    it('loads the three photo maps with world-scale repeats (diffuse sRGB only)', () => {
      const material = discOf(
        new ConcreteDiscGrid().createGrid(photoOptions())
      ).material as THREE.MeshStandardMaterial;
      expect(loadSpy).toHaveBeenCalledTimes(3);
      expect(material.map).not.toBeNull();
      expect(material.normalMap).not.toBeNull();
      expect(material.roughnessMap).not.toBeNull();
      expect(material.map!.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(material.normalMap!.colorSpace).not.toBe(THREE.SRGBColorSpace);
      expect(material.map!.repeat.x).toBeGreaterThan(1);
      expect(material.color.getHexString()).toBe('ffffff');
    });

    it('falls back to the procedural/matte look when a photo map fails to fetch (offline)', () => {
      const material = discOf(
        new ConcreteDiscGrid().createGrid(photoOptions())
      ).material as THREE.MeshStandardMaterial;
      errorCallbacks[0]({});
      // jsdom has no 2D canvas either, so the flat matte tone carries the disc —
      // never the photo path's white multiplier over nothing.
      expect(material.map).toBeNull();
      expect(material.color.getHexString()).not.toBe('ffffff');
      expect(material.roughness).toBeLessThan(1);
    });

    it('an empty-string texture opts out of the photo path (offline harness)', () => {
      const grid = new ConcreteDiscGrid().createGrid({
        size: 10,
        divisions: 3,
        styleOptions: { texture: '', normalMap: '', roughnessMap: '' },
      });
      expect(loadSpy).not.toHaveBeenCalled();
      const material = discOf(grid).material as THREE.MeshStandardMaterial;
      expect(material.color.getHexString()).not.toBe('ffffff');
    });

    it('installs the untiled sampler on the material (kills repeats at every distance)', () => {
      const material = discOf(
        new ConcreteDiscGrid().createGrid(photoOptions())
      ).material as THREE.MeshStandardMaterial;
      expect(material.onBeforeCompile).toBeDefined();
      const shader = {
        fragmentShader:
          '#include <common>\n#include <map_fragment>\n#include <normal_fragment_maps>\n#include <roughnessmap_fragment>',
        vertexShader: '',
        uniforms: {},
      };
      material.onBeforeCompile(shader as never, {} as never);
      expect(shader.fragmentShader).toContain('softboxTextureNoTile');
      expect(shader.fragmentShader).not.toContain('#include <map_fragment>');
    });
  });

  it('is registered with the factory under concrete_disc', () => {
    const grid = GridFactory.createGrid(GridType.CONCRETE_DISC, options());
    expect(grid.name).toBe('Grid_concrete_disc');
    expect(catcherOf(grid)).toBeDefined();
  });
});
