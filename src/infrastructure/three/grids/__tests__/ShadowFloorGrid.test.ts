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
    // Two-sided so the tracer lights the concave interior of the dome.
    expect((dome.material as THREE.MeshStandardMaterial).side).toBe(THREE.DoubleSide);
    expect(dome.receiveShadow).toBe(true);
    // Off in the raster view; the path tracer flips it on only during ingest.
    expect(dome.visible).toBe(false);
    // NOT tagged as a raster shadow helper (that flag hides it from the tracer,
    // which is the opposite of what this dome is for).
    expect(dome.userData[CONTACT_SHADOW_HELPER_FLAG]).toBeUndefined();
  });

  it('is an open-top surface of revolution: floor at 0, walls rise, and it is axisymmetric', () => {
    const geometry = ptFloorOf(build(20)).geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // Floor at local y=0; walls rise well above it.
    expect(box.min.y).toBeCloseTo(0, 1);
    expect(box.max.y).toBeGreaterThan(1);

    // Axisymmetric about Y: the footprint is a full circle (same extent left/
    // right/front/back), so it looks identical from every azimuth — the whole
    // point of the dome over a directional cove.
    expect(box.min.x).toBeCloseTo(-box.max.x, 1);
    expect(box.min.z).toBeCloseTo(-box.max.z, 1);
    expect(box.max.x).toBeCloseTo(box.max.z, 1);

    // Open top (no ceiling cap): the top edge is a ring at the wall radius —
    // every vertex up there is far from the axis. A capped dome would have a
    // centre vertex (radius ~0) at the top instead.
    const position = geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(0);
    let topRingMinRadius = Infinity;
    for (let i = 0; i < position.count; i += 1) {
      if (position.getY(i) > box.max.y - 1e-3) {
        topRingMinRadius = Math.min(topRingMinRadius, Math.hypot(position.getX(i), position.getZ(i)));
      }
    }
    expect(topRingMinRadius).toBeGreaterThan(1);
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
