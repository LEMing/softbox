import * as THREE from 'three';
import { HexagonalGlassGrid } from '../HexagonalGlassGrid';
import { IGridOptions } from '../IGridStyle';
import { CONTACT_SHADOW_LIVE_NAME } from '../../ContactShadowBaker';

const options = (styleOptions: IGridOptions['styleOptions'] = {}): IGridOptions => ({
  size: 10,
  divisions: 3,
  color: '#ffffff',
  styleOptions: { hexRadius: 1, tileSize: 1, ...styleOptions },
});

const shadowCatcher = (grid: THREE.Object3D): THREE.Mesh | undefined =>
  grid.children.find(
    (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.material instanceof THREE.ShadowMaterial
  );

const floorMesh = (grid: THREE.Object3D): THREE.Mesh =>
  grid.children.find(
    (c): c is THREE.Mesh =>
      c instanceof THREE.Mesh && c.material instanceof THREE.MeshPhysicalMaterial
  )!;

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

  it('merges the whole floor into a single mesh alongside the shadow-catcher', () => {
    const grid = new HexagonalGlassGrid().createGrid(options());

    // One floor mesh + one shadow-catcher — never a mesh per tile: at
    // real-world paver scale that multiplied into thousands of draw calls.
    expect(grid.children.length).toBe(2);
    const floor = floorMesh(grid);
    expect(floor).toBeDefined();
    expect(floor.receiveShadow).toBe(true);
  });

  it('carries every tile of the ring layout in the merged geometry', () => {
    const singleTile = floorMesh(
      new HexagonalGlassGrid().createGrid(options({ hexRadius: 0 }))
    );
    const singleRing = floorMesh(new HexagonalGlassGrid().createGrid(options()));

    // A single-ring hex layout is 7 tiles.
    const vertsPerTile = singleTile.geometry.getAttribute('position').count;
    expect(singleRing.geometry.getAttribute('position').count).toBe(vertsPerTile * 7);
  });

  it('keeps the merged tile tops exactly at y=0 so models rest on the floor', () => {
    const floor = floorMesh(new HexagonalGlassGrid().createGrid(options()));

    floor.geometry.computeBoundingBox();
    expect(floor.geometry.boundingBox!.max.y).toBeCloseTo(0, 5);
  });

  it('spreads the ring tiles around the center instead of stacking them', () => {
    const floor = floorMesh(new HexagonalGlassGrid().createGrid(options()));

    floor.geometry.computeBoundingBox();
    const size = floor.geometry.boundingBox!.getSize(new THREE.Vector3());
    const singleTile = floorMesh(
      new HexagonalGlassGrid().createGrid(options({ hexRadius: 0 }))
    );
    singleTile.geometry.computeBoundingBox();
    const tileWidth = singleTile.geometry.boundingBox!.getSize(new THREE.Vector3()).x;

    expect(size.x).toBeGreaterThan(tileWidth * 2);
    expect(size.z).toBeGreaterThan(tileWidth * 2);
  });

  it('honours matte styleOptions on the shared material', () => {
    const glassy = floorMesh(new HexagonalGlassGrid().createGrid(options()));
    const matte = floorMesh(
      new HexagonalGlassGrid().createGrid(options({ transmission: 0, roughness: 0.9 }))
    );

    expect((glassy.material as THREE.MeshPhysicalMaterial).transparent).toBe(true);
    const matteMaterial = matte.material as THREE.MeshPhysicalMaterial;
    expect(matteMaterial.transparent).toBe(false);
    expect(matteMaterial.roughness).toBe(0.9);
    expect(matteMaterial.clearcoat).toBe(0);
  });
});
