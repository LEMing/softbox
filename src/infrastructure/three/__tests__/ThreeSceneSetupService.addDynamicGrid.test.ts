import * as THREE from 'three';
import { ThreeSceneSetupService } from '../ThreeSceneSetupService';
import { ThreeSceneAdapter } from '../ThreeScene';
import { ThreeObject3DAdapter } from '../ThreeObject3D';
import { GridType } from '../grids/IGridStyle';
import { CONTACT_SHADOW_LIVE_NAME, PATH_TRACING_FLOOR_FLAG } from '../ContactShadowBaker';

const makeSceneWithGridOptions = () => {
  const threeScene = new THREE.Scene();
  threeScene.userData = {
    gridOptions: {
      enabled: true,
      color: '#aaaaaa',
      type: GridType.HEXAGONAL_GLASS,
    },
  };
  return threeScene;
};

const findGrid = (threeScene: THREE.Scene): THREE.Object3D | undefined =>
  threeScene.children.find((child) => child.userData?.isGrid);

describe('ThreeSceneSetupService.addDynamicGrid', () => {
  it('builds the floor under an origin model', () => {
    const threeScene = makeSceneWithGridOptions();
    const model = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    threeScene.add(model);

    const result = new ThreeSceneSetupService().addDynamicGrid(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(model)
    );

    expect(result.ok).toBe(true);
    const grid = findGrid(threeScene);
    expect(grid).toBeDefined();
    expect(grid!.position.x).toBeCloseTo(0);
    expect(grid!.position.z).toBeCloseTo(0);
  });

  it('centers the floor under an off-origin model instead of at the origin', () => {
    const threeScene = makeSceneWithGridOptions();
    const model = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    model.position.set(100, 1, -40);
    threeScene.add(model);

    const result = new ThreeSceneSetupService().addDynamicGrid(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(model)
    );

    expect(result.ok).toBe(true);
    const grid = findGrid(threeScene);
    expect(grid).toBeDefined();
    // A floor at the origin would leave the model standing beside it.
    expect(grid!.position.x).toBeCloseTo(100);
    expect(grid!.position.z).toBeCloseTo(-40);
    expect(grid!.position.y).toBe(0);
  });

  it('replaces the previous grid when the model moves', () => {
    const threeScene = makeSceneWithGridOptions();
    const model = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    model.position.set(100, 1, -40);
    threeScene.add(model);
    const service = new ThreeSceneSetupService();
    service.addDynamicGrid(new ThreeSceneAdapter(threeScene), new ThreeObject3DAdapter(model));

    model.position.set(0, 1, 0);
    model.updateMatrixWorld(true);
    service.addDynamicGrid(new ThreeSceneAdapter(threeScene), new ThreeObject3DAdapter(model));

    const grids = threeScene.children.filter((child) => child.userData?.isGrid);
    expect(grids).toHaveLength(1);
    expect(grids[0].position.x).toBeCloseTo(0);
    expect(grids[0].position.z).toBeCloseTo(0);
  });

  it('rides the shadow_floor tracer floor at the catcher height so the model sits flush on it', () => {
    const threeScene = new THREE.Scene();
    threeScene.userData = { gridOptions: { enabled: true, type: GridType.SHADOW_FLOOR } };
    // A tall model drives the catcher lift to its clamp ceiling; the fixed
    // placeholder height on the floor would otherwise leave it hovering below.
    const model = new THREE.Mesh(new THREE.BoxGeometry(2, 40, 2));
    model.position.set(0, 20, 0);
    threeScene.add(model);

    new ThreeSceneSetupService().addDynamicGrid(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(model)
    );

    const grid = findGrid(threeScene)!;
    const catcher = grid.getObjectByName(CONTACT_SHADOW_LIVE_NAME)!;
    let ptFloor: THREE.Object3D | undefined;
    grid.traverse((child) => {
      if (child.userData?.[PATH_TRACING_FLOOR_FLAG]) ptFloor = child;
    });
    expect(catcher).toBeDefined();
    expect(ptFloor).toBeDefined();
    expect(ptFloor!.position.y).toBeCloseTo(catcher.position.y);
    expect(catcher.position.y).toBeGreaterThan(0);
  });
});
