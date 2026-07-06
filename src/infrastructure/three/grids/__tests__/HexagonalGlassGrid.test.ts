import * as THREE from 'three';
import { HexagonalGlassGrid } from '../HexagonalGlassGrid';
import { IGridOptions } from '../IGridStyle';
import { CONTACT_SHADOW_LIVE_NAME } from '../../ContactShadowBaker';

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
  it('includes a transparent shadow-catcher so the model shadow reads on the tiles', () => {
    const grid = new HexagonalGlassGrid().createGrid(options());
    const catcher = shadowCatcher(grid);

    expect(catcher).toBeDefined();
    expect(catcher!.receiveShadow).toBe(true);
    // Laid flat, just above the (opaque) tile tops so the shadow isn't hidden beneath them.
    expect(catcher!.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(catcher!.position.y).toBeGreaterThanOrEqual(0);
    expect((catcher!.material as THREE.ShadowMaterial).transparent).toBe(true);
  });

  it('names the shadow-catcher so the contact-shadow baker can swap it for the baked texture', () => {
    const grid = new HexagonalGlassGrid().createGrid(options());
    expect(shadowCatcher(grid)!.name).toBe(CONTACT_SHADOW_LIVE_NAME);
  });

  it('still builds the glass tiles alongside the shadow-catcher', () => {
    const grid = new HexagonalGlassGrid().createGrid(options());
    // A single-ring hex layout is 7 tiles + 1 shadow-catcher.
    expect(grid.children.length).toBe(8);
  });
});
