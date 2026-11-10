import * as THREE from 'three';
import { ShadowFloorGrid } from '../ShadowFloorGrid';
import {
  CONTACT_SHADOW_HELPER_FLAG,
  CONTACT_SHADOW_LIVE_NAME,
  PATH_TRACING_FLOOR_FLAG,
} from '../../ContactShadowBaker';

const catcherOf = (grid: THREE.Object3D): THREE.Mesh =>
  grid.children.find((c) => (c as THREE.Mesh).material instanceof THREE.ShadowMaterial) as THREE.Mesh;
const ptFloorOf = (grid: THREE.Object3D): THREE.Mesh =>
  grid.children.find((c) => c.userData[PATH_TRACING_FLOOR_FLAG]) as THREE.Mesh;
const build = (size: number | undefined) =>
  new ShadowFloorGrid().createGrid({ size: size as number, divisions: 20 });

describe('ShadowFloorGrid', () => {
  it('builds a raster shadow-catcher (ShadowMaterial disc) with no visible tiles', () => {
    const grid = build(20);
    const catcher = catcherOf(grid);
    expect(catcher).toBeInstanceOf(THREE.Mesh);
    expect(catcher.geometry).toBeInstanceOf(THREE.CircleGeometry);
    expect(catcher.material).toBeInstanceOf(THREE.ShadowMaterial);
  });

  it('adds a tracer-only infinity dome: real, matte, receiving, hidden from the raster view', () => {
    const dome = ptFloorOf(build(20));
    expect(dome).toBeInstanceOf(THREE.Mesh);
    expect(dome.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((dome.material as THREE.MeshStandardMaterial).roughness).toBe(1);
    expect((dome.material as THREE.MeshStandardMaterial).side).toBe(THREE.DoubleSide);
    expect(dome.receiveShadow).toBe(true);
    expect(dome.visible).toBe(false);
    expect(dome.userData[CONTACT_SHADOW_HELPER_FLAG]).toBeUndefined();
  });

  it('is an open-top surface of revolution: floor at 0, walls rise, and it is axisymmetric', () => {
    const geometry = ptFloorOf(build(20)).geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.y).toBeCloseTo(0, 1);
    expect(box.max.y).toBeGreaterThan(1);

    expect(box.min.x).toBeCloseTo(-box.max.x, 1);
    expect(box.min.z).toBeCloseTo(-box.max.z, 1);
    expect(box.max.x).toBeCloseTo(box.max.z, 1);

    const position = geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(0);
    const maxRadius = box.max.x;

    let topRingMinRadius = Infinity;
    let floorEdgeRadius = 0;
    let wallHeightSpan = { min: Infinity, max: -Infinity };
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      const r = Math.hypot(position.getX(i), position.getZ(i));
      if (y > box.max.y - 1e-3) {
        topRingMinRadius = Math.min(topRingMinRadius, r);
      }
      if (y < 1e-3) {
        floorEdgeRadius = Math.max(floorEdgeRadius, r);
      }
      if (r > maxRadius - 1e-3) {
        wallHeightSpan = { min: Math.min(wallHeightSpan.min, y), max: Math.max(wallHeightSpan.max, y) };
      }
    }
    expect(topRingMinRadius).toBeGreaterThan(1);

    expect(floorEdgeRadius).toBeLessThan(maxRadius * 0.9);
    expect(wallHeightSpan.max - wallHeightSpan.min).toBeGreaterThan(box.max.y * 0.3);
  });

  it('names and flags the catcher so the baker and path tracer treat it as the contact shadow', () => {
    const catcher = catcherOf(build(20));
    expect(catcher.name).toBe(CONTACT_SHADOW_LIVE_NAME);
    expect(catcher.userData[CONTACT_SHADOW_HELPER_FLAG]).toBe(true);
  });

  it('lays the disc flat and lifts it just off the floor to receive shadow', () => {
    const catcher = catcherOf(build(20));
    expect(catcher.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(catcher.position.y).toBeGreaterThan(0);
    expect(catcher.receiveShadow).toBe(true);
  });

  it('scales the disc radius to 1.5x the grid size so the spreading shadow always lands', () => {
    const geometry = catcherOf(build(20)).geometry as THREE.CircleGeometry;
    expect(geometry.parameters.radius).toBeCloseTo(30);
  });

  it('never produces a degenerate (sub-unit) disc for tiny or missing sizes', () => {
    for (const size of [undefined, 0, 0.1]) {
      const geometry = catcherOf(build(size)).geometry as THREE.CircleGeometry;
      expect(geometry.parameters.radius).toBeGreaterThanOrEqual(1);
    }
  });

  it('exposes a no-op dispose (no retained resources)', () => {
    expect(() => new ShadowFloorGrid().dispose()).not.toThrow();
  });
});
