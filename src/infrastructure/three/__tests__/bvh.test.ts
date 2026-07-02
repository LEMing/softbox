import * as THREE from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';
import { buildRaycastBvh, disposeBoundsTree } from '../bvh';

type BvhGeometry = THREE.BufferGeometry & { boundsTree?: unknown };

const makeMesh = () =>
  new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());

describe('buildRaycastBvh', () => {
  it('builds a bounds tree and patches raycast on every mesh in the tree', () => {
    const root = new THREE.Group();
    const a = makeMesh();
    const b = makeMesh();
    root.add(a);
    a.add(b);

    buildRaycastBvh(root);

    expect((a.geometry as BvhGeometry).boundsTree).toBeTruthy();
    expect((b.geometry as BvhGeometry).boundsTree).toBeTruthy();
    expect(a.raycast).toBe(acceleratedRaycast);
    // Only the instances are patched — the shared prototype stays pristine.
    expect(THREE.Mesh.prototype.raycast).not.toBe(acceleratedRaycast);
  });

  it('is idempotent — an existing bounds tree is kept', () => {
    const mesh = makeMesh();
    buildRaycastBvh(mesh);
    const first = (mesh.geometry as BvhGeometry).boundsTree;

    buildRaycastBvh(mesh);

    expect((mesh.geometry as BvhGeometry).boundsTree).toBe(first);
  });

  it('skips skinned meshes (their BVH would describe the bind pose)', () => {
    const skinned = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );

    buildRaycastBvh(skinned);

    expect((skinned.geometry as BvhGeometry).boundsTree).toBeUndefined();
  });

  it('keeps accelerated raycasts identical to the stock ones', () => {
    const mesh = makeMesh();
    mesh.updateMatrixWorld();
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
    const before = raycaster.intersectObject(mesh, true)[0];

    buildRaycastBvh(mesh);
    (raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
    const after = raycaster.intersectObject(mesh, true)[0];

    expect(after).toBeTruthy();
    expect(after.distance).toBeCloseTo(before.distance);
    expect(after.point.z).toBeCloseTo(before.point.z);
  });
});

describe('disposeBoundsTree', () => {
  it('releases the bounds tree', () => {
    const mesh = makeMesh();
    buildRaycastBvh(mesh);
    expect((mesh.geometry as BvhGeometry).boundsTree).toBeTruthy();

    disposeBoundsTree(mesh.geometry);

    expect((mesh.geometry as BvhGeometry).boundsTree).toBeUndefined();
  });
});
