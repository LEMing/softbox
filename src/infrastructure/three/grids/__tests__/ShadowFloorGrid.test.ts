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

  it('sweeps the cove up into walls (has geometry rising well above the floor)', () => {
    const cove = ptFloorOf(build(20));
    cove.geometry.computeBoundingBox();
    const box = cove.geometry.boundingBox!;
    // The floor sits at local y=0; the back/side walls rise above it, and the
    // ceiling is trimmed away (open top), so the top is a fraction of the span.
    expect(box.min.y).toBeCloseTo(0, 1);
    expect(box.max.y).toBeGreaterThan(1);
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
