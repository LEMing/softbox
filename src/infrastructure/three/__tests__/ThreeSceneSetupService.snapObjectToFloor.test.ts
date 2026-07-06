import * as THREE from 'three';
import { ThreeSceneSetupService } from '../ThreeSceneSetupService';
import { ThreeSceneAdapter } from '../ThreeScene';
import { ThreeObject3DAdapter } from '../ThreeObject3D';

// DoubleSide so a straight-down ray registers hits on both the top and
// bottom faces of these test boxes, regardless of triangle winding —
// isolates the gap-computation logic from mesh-authoring quirks.
const doubleSidedBox = (size: [number, number, number]) =>
  new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));

describe('ThreeSceneSetupService.snapObjectToFloor', () => {
  it('drops the object so its lowest point touches the highest grid point', () => {
    const threeScene = new THREE.Scene();

    // A flat floor tile whose top face sits at y=0.
    const gridMesh = doubleSidedBox([10, 0.1, 10]);
    gridMesh.position.set(0, -0.05, 0);
    gridMesh.userData.isGrid = true;
    threeScene.add(gridMesh);

    // A 1x1x1 box centered at y=1 — its bottom face is at y=0.5, i.e.
    // floating half a unit above the floor.
    const objectMesh = doubleSidedBox([1, 1, 1]);
    const objectGroup = new THREE.Group();
    objectGroup.position.set(0, 1, 0);
    objectGroup.add(objectMesh);
    threeScene.add(objectGroup);

    const service = new ThreeSceneSetupService();
    const result = service.snapObjectToFloor(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(objectGroup)
    );

    expect(result.ok).toBe(true);
    expect(objectGroup.position.y).toBeCloseTo(0.5, 4);
  });

  it('lifts an object that is embedded below the floor back up to it', () => {
    const threeScene = new THREE.Scene();

    const gridMesh = doubleSidedBox([10, 0.1, 10]);
    gridMesh.position.set(0, -0.05, 0);
    gridMesh.userData.isGrid = true;
    threeScene.add(gridMesh);

    // Bottom face at y=-0.3 — sunk into the floor.
    const objectMesh = doubleSidedBox([1, 1, 1]);
    const objectGroup = new THREE.Group();
    objectGroup.position.set(0, 0.2, 0);
    objectGroup.add(objectMesh);
    threeScene.add(objectGroup);

    const service = new ThreeSceneSetupService();
    const result = service.snapObjectToFloor(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(objectGroup)
    );

    expect(result.ok).toBe(true);
    expect(objectGroup.position.y).toBeCloseTo(0.5, 4);
  });

  it('does nothing when the scene has no grid to drop onto', () => {
    const threeScene = new THREE.Scene();
    const objectMesh = doubleSidedBox([1, 1, 1]);
    objectMesh.position.set(0, 5, 0);
    threeScene.add(objectMesh);

    const service = new ThreeSceneSetupService();
    const result = service.snapObjectToFloor(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(objectMesh)
    );

    expect(result.ok).toBe(true);
    expect(objectMesh.position.y).toBe(5);
  });

  it('leaves an object already touching the floor alone', () => {
    const threeScene = new THREE.Scene();

    const gridMesh = doubleSidedBox([10, 0.1, 10]);
    gridMesh.position.set(0, -0.05, 0);
    gridMesh.userData.isGrid = true;
    threeScene.add(gridMesh);

    const objectMesh = doubleSidedBox([1, 1, 1]);
    const objectGroup = new THREE.Group();
    objectGroup.position.set(0, 0.5, 0); // bottom exactly at y=0
    objectGroup.add(objectMesh);
    threeScene.add(objectGroup);

    const service = new ThreeSceneSetupService();
    const result = service.snapObjectToFloor(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(objectGroup)
    );

    expect(result.ok).toBe(true);
    expect(objectGroup.position.y).toBeCloseTo(0.5, 4);
  });
});
