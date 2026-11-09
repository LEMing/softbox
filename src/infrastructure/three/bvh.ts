import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

export function buildRaycastBvh(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh & {
      isSkinnedMesh?: boolean;
      isInstancedMesh?: boolean;
      isBatchedMesh?: boolean;
    };
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.isBatchedMesh) {
      return;
    }
    const geometry = mesh.geometry;
    if (!geometry?.attributes?.position || geometry.morphAttributes?.position?.length) {
      return;
    }
    if (!geometry.boundsTree) {
      geometry.boundsTree = new MeshBVH(geometry);
    }
    mesh.raycast = acceleratedRaycast;
  });
}

export function disposeBoundsTree(geometry: THREE.BufferGeometry): void {
  if (geometry.boundsTree) {
    geometry.boundsTree = undefined;
  }
}
