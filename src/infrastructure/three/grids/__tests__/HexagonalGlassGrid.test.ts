import * as THREE from 'three';
import { HexagonalGlassGrid } from '../HexagonalGlassGrid';
import { IGridOptions } from '../IGridStyle';

const options = (): IGridOptions => ({
  size: 10,
  divisions: 3,
  color: '#ffffff',
  styleOptions: { hexRadius: 1, tileSize: 1 },
});

const shadowCatcher = (grid: THREE.Object3D): THREE.Mesh | undefined =>
  grid.children.find(
    (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.material instanceof THREE.ShadowMaterial
  );

describe('HexagonalGlassGrid', () => {
  it('includes a transparent shadow-catcher so the model shadow reads on the glass', () => {
    const grid = new HexagonalGlassGrid().createGrid(options());
    const catcher = shadowCatcher(grid);

    expect(catcher).toBeDefined();
    expect(catcher!.receiveShadow).toBe(true);
    // Laid flat on the floor and just below the model base.
    expect(catcher!.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(catcher!.position.y).toBeLessThanOrEqual(0);
    expect((catcher!.material as THREE.ShadowMaterial).transparent).toBe(true);
  });

  it('still builds the glass tiles alongside the shadow-catcher', () => {
    const grid = new HexagonalGlassGrid().createGrid(options());
    // A single-ring hex layout is 7 tiles + 1 shadow-catcher.
    expect(grid.children.length).toBe(8);
  });
});
