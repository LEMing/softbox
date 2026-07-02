import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

/**
 * Build a BVH for every static mesh under `root` so raycasts (click picking,
 * hotspot occlusion) run in logarithmic instead of linear time on large
 * models. `raycast` is patched per instance — never on shared prototypes, so
 * the consumer's own three.js objects are untouched. Idempotent: geometries
 * that already carry a boundsTree are not rebuilt.
 *
 * Excluded, because a static single-transform BVH cannot reproduce their
 * stock raycast semantics:
 * - skinned meshes (the BVH would describe the bind pose);
 * - morph-target meshes (stock raycast applies morphTargetInfluences);
 * - instanced/batched meshes (stock raycast iterates instances/draw ranges).
 *
 * Note: building sorts each geometry's index in place (triangle order changes,
 * rendering is unaffected) and adds an index to non-indexed geometry.
 */
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
    // Also reached for meshes SHARING an already-built geometry.
    mesh.raycast = acceleratedRaycast;
  });
}

/** Free a geometry's BVH (plain CPU arrays — unsetting releases them to GC). */
export function disposeBoundsTree(geometry: THREE.BufferGeometry): void {
  if (geometry.boundsTree) {
    geometry.boundsTree = undefined;
  }
}
