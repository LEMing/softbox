import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

/**
 * Build a BVH for every static mesh under `root` so raycasts (click picking,
 * hotspot occlusion) run in logarithmic instead of linear time on large
 * models. `raycast` is patched per instance — never on shared prototypes, so
 * the consumer's own three.js objects are untouched. Idempotent: geometries
 * that already carry a boundsTree are skipped. Skinned meshes are excluded
 * (their BVH would describe the bind pose, not the animated surface).
 */
export function buildRaycastBvh(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh & { isSkinnedMesh?: boolean };
    if (!mesh.isMesh || mesh.isSkinnedMesh) {
      return;
    }
    const geometry = mesh.geometry;
    if (!geometry?.attributes?.position || geometry.boundsTree) {
      return;
    }
    // three-mesh-bvh's type augmentation types `boundsTree` as the worker-built
    // subclass; the synchronous MeshBVH is the same tree at runtime.
    geometry.boundsTree = new MeshBVH(geometry) as NonNullable<THREE.BufferGeometry['boundsTree']>;
    mesh.raycast = acceleratedRaycast;
  });
}

/** Free a geometry's BVH (plain CPU arrays — unsetting releases them to GC). */
export function disposeBoundsTree(geometry: THREE.BufferGeometry): void {
  if (geometry.boundsTree) {
    geometry.boundsTree = undefined;
  }
}
