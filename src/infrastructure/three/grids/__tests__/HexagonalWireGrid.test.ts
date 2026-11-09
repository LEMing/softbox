import * as THREE from 'three';
import { HexagonalWireGrid } from '../HexagonalWireGrid';

const positionsAreFinite = (group: THREE.Object3D): boolean => {
  let finite = true;
  group.traverse((child) => {
    const geometry = (child as THREE.Line).geometry as THREE.BufferGeometry | undefined;
    const position = geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
    if (position) {
      for (let i = 0; i < position.array.length; i++) {
        if (!Number.isFinite(position.array[i])) {
          finite = false;
        }
      }
    }
  });
  return finite;
};

describe('HexagonalWireGrid', () => {
  it('produces finite vertex positions for a single-hex grid (radius 0)', () => {
    const grid = new HexagonalWireGrid().createGrid({
      size: 0.12,
      divisions: 1,
      styleOptions: { hexRadius: 0 },
    });

    expect(grid.children.length).toBeGreaterThan(0);
    expect(positionsAreFinite(grid)).toBe(true);

    const line = grid.children[0] as THREE.Line;
    line.geometry.computeBoundingSphere();
    expect(Number.isFinite(line.geometry.boundingSphere?.radius ?? NaN)).toBe(true);
  });

  it('produces finite positions for a normal multi-ring grid', () => {
    const grid = new HexagonalWireGrid().createGrid({
      size: 20,
      divisions: 7,
      styleOptions: { hexRadius: 3 },
    });
    expect(positionsAreFinite(grid)).toBe(true);
  });
});
