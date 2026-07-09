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

  it('adds a tracer-only cyclorama: real, matte, receiving, hidden from the raster view', () => {
    const cove = ptFloorOf(build(20));
    expect(cove).toBeInstanceOf(THREE.Mesh);
    expect(cove.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((cove.material as THREE.MeshStandardMaterial).roughness).toBe(1);
    // Two-sided so the tracer lights the concave interior of the cove.
    expect((cove.material as THREE.MeshStandardMaterial).side).toBe(THREE.DoubleSide);
    expect(cove.receiveShadow).toBe(true);
    // Off in the raster view; the path tracer flips it on only during ingest.
    expect(cove.visible).toBe(false);
    // NOT tagged as a raster shadow helper (that flag hides it from the tracer,
    // which is the opposite of what this cove is for).
    expect(cove.userData[CONTACT_SHADOW_HELPER_FLAG]).toBeUndefined();
  });

  it('sweeps the cove up into walls with an open top and front (no ceiling or camera-side wall)', () => {
    const geometry = ptFloorOf(build(20)).geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // Floor at local y=0; walls rise above it.
    expect(box.min.y).toBeCloseTo(0, 1);
    expect(box.max.y).toBeGreaterThan(1);

    // The trim removes the ceiling and the camera-side (front, +z) wall, so —
    // unlike a closed box — no triangle *centroid* reaches the top or the front
    // extreme (only wall edges do). This is what actually verifies the cut.
    const position = geometry.getAttribute('position');
    let maxVertexY = -Infinity;
    let maxCentroidY = -Infinity;
    let maxVertexZ = -Infinity;
    let maxCentroidZ = -Infinity;
    for (let i = 0; i < position.count; i += 3) {
      maxCentroidY = Math.max(maxCentroidY, (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3);
      maxCentroidZ = Math.max(maxCentroidZ, (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3);
      for (let v = 0; v < 3; v += 1) {
        maxVertexY = Math.max(maxVertexY, position.getY(i + v));
        maxVertexZ = Math.max(maxVertexZ, position.getZ(i + v));
      }
    }
    expect(position.count).toBeGreaterThan(0);
    expect(maxCentroidY).toBeLessThan(maxVertexY - 1e-3); // open top
    expect(maxCentroidZ).toBeLessThan(maxVertexZ - 1e-3); // open front
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
