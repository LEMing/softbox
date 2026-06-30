import * as THREE from 'three';
import { StoneTileGrid } from '../StoneTileGrid';
import { GridFactory } from '../GridFactory';
import { GridType, IGridOptions } from '../IGridStyle';

describe('StoneTileGrid texture ownership', () => {
  let loadSpy: jest.SpyInstance;

  beforeEach(() => {
    // Each load returns a distinct texture so we can detect sharing/caching.
    loadSpy = jest
      .spyOn(THREE.TextureLoader.prototype, 'load')
      .mockImplementation(() => new THREE.Texture());
  });

  afterEach(() => {
    loadSpy.mockRestore();
  });

  const texturedOptions = (): IGridOptions => ({
    size: 10,
    divisions: 2,
    color: 0x808080,
    styleOptions: { texture: 'stone.png', normalMap: 'normal.png', roughnessMap: 'rough.png' },
  });

  const materialOf = (grid: THREE.Object3D): THREE.MeshStandardMaterial =>
    (grid.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;

  it('applies the loaded maps to the tile material', () => {
    const grid = new StoneTileGrid().createGrid(texturedOptions());
    const material = materialOf(grid);
    expect(material.map).not.toBeNull();
    expect(material.normalMap).not.toBeNull();
    expect(material.roughnessMap).not.toBeNull();
  });

  it('loads fresh textures per grid instead of sharing a cached one', () => {
    const style = new StoneTileGrid();
    const first = materialOf(style.createGrid(texturedOptions()));
    const second = materialOf(style.createGrid(texturedOptions()));

    // No cross-grid cache: the two grids must not share texture objects.
    expect(first.map).not.toBe(second.map);
    expect(first.normalMap).not.toBe(second.normalMap);
  });

  it('does not hand out a texture that a previous grid teardown disposed (use-after-dispose)', () => {
    const style = new StoneTileGrid();
    const first = materialOf(style.createGrid(texturedOptions()));
    const firstMap = first.map as THREE.Texture;

    // Simulate the scene's canonical disposal freeing this grid's textures.
    firstMap.dispose();

    const second = materialOf(style.createGrid(texturedOptions()));
    // The new grid must get a fresh texture, never the just-disposed one.
    expect(second.map).not.toBe(firstMap);
  });

  it('produces independent textures across grids even through the GridFactory singleton', () => {
    // GridFactory holds StoneTileGrid as a static singleton — the original
    // source of the shared, disposed-then-reused texture bug.
    const a = materialOf(GridFactory.createGrid(GridType.STONE_TILES, texturedOptions()));
    const b = materialOf(GridFactory.createGrid(GridType.STONE_TILES, texturedOptions()));
    expect(a.map).not.toBe(b.map);
  });

  it('builds tiles without textures when none are provided', () => {
    const grid = new StoneTileGrid().createGrid({ size: 10, divisions: 2 });
    expect(grid.children.length).toBe(4);
    expect(materialOf(grid).map).toBeNull();
    expect(loadSpy).not.toHaveBeenCalled();
  });
});
