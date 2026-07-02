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

  it('skips instanced meshes (stock raycast iterates instances)', () => {
    const instanced = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      2
    );
    const stockRaycast = instanced.raycast;

    buildRaycastBvh(instanced);

    expect((instanced.geometry as BvhGeometry).boundsTree).toBeUndefined();
    expect(instanced.raycast).toBe(stockRaycast);
  });

  it('keeps instanced-mesh picking working after a build over the whole tree', () => {
    const root = new THREE.Group();
    const instanced = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      1
    );
    const matrix = new THREE.Matrix4().setPosition(5, 0, 0);
    instanced.setMatrixAt(0, matrix);
    instanced.instanceMatrix.needsUpdate = true;
    root.add(instanced);
    root.updateMatrixWorld(true);

    buildRaycastBvh(root);

    const raycaster = new THREE.Raycaster(new THREE.Vector3(5, 0, 5), new THREE.Vector3(0, 0, -1));
    const hit = raycaster.intersectObject(root, true)[0];
    expect(hit).toBeTruthy();
    expect(hit.instanceId).toBe(0);
  });

  it('skips morph-target meshes (stock raycast applies influences)', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.morphAttributes.position = [geometry.attributes.position.clone()];
    const morphed = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());

    buildRaycastBvh(morphed);

    expect((morphed.geometry as BvhGeometry).boundsTree).toBeUndefined();
  });

  it('patches every mesh sharing one geometry (single build)', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const first = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    const second = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    const root = new THREE.Group();
    root.add(first);
    root.add(second);

    buildRaycastBvh(root);

    expect(first.raycast).toBe(acceleratedRaycast);
    expect(second.raycast).toBe(acceleratedRaycast);
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
