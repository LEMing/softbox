import * as THREE from 'three';
import HexTile from '../HexTile';
import { HexTileConfig } from '../HexTileConfig';

describe('HexTile', () => {
  const size = 1;
  const bevel = HexTileConfig.getBevelSize(size);
  const height = HexTileConfig.getHeight(size);
  const origin = new THREE.Vector3(0, 0, 0);

  it('bakes the resting orientation: bevel tip up, extrusion buried below', () => {
    const geometry = new HexTile(origin, size, '#ffffff').createGeometry();

    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // Pins the Z-then-X bake order (Euler 'XYZ' applies Z first): the
    // swapped order stands the tile on edge, putting max.y at ~0.5 instead
    // of the 0.04 bevel tip.
    expect(box.max.y).toBeCloseTo(bevel, 5);
    expect(box.min.y).toBeCloseTo(-(height + bevel), 5);
  });

  it('bakes the tile position into the vertices', () => {
    const geometry = new HexTile(new THREE.Vector3(3, -bevel, 7), size, '#ffffff').createGeometry();

    geometry.computeBoundingBox();
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
    expect(center.x).toBeCloseTo(3, 5);
    expect(center.z).toBeCloseTo(7, 5);
    expect(geometry.boundingBox!.max.y).toBeCloseTo(0, 5);
  });

  it('produces the non-indexed attribute set the floor merge replicates', () => {
    const geometry = new HexTile(origin, size, '#ffffff').createGeometry();

    expect(geometry.getIndex()).toBeNull();
    expect(geometry.getAttribute('position')).toBeDefined();
    expect(geometry.getAttribute('normal')).toBeDefined();
    expect(geometry.getAttribute('uv')).toBeDefined();
  });

  it('defaults to the glossy glass material; matte options switch the gloss off', () => {
    const glassy = new HexTile(origin, size, '#ffffff').createMaterial();
    const matte = new HexTile(origin, size, '#ffffff', {
      transmission: 0,
      roughness: 0.9,
    }).createMaterial();

    expect(glassy.transparent).toBe(true);
    expect(glassy.clearcoat).toBe(1);
    expect(glassy.sheen).toBe(1);

    expect(matte.transparent).toBe(false);
    expect(matte.clearcoat).toBe(0);
    expect(matte.roughness).toBe(0.9);
  });
});
