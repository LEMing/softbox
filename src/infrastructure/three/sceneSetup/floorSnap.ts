import * as THREE from 'three';
import { IScene } from '../../../core/interfaces/IScene';
import { IObject3D } from '../../../core/interfaces/IObject3D';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { toThreeObject, toThreeScene } from '../unwrap';
import { PATH_TRACING_FLOOR_FLAG } from '../ContactShadowBaker';

export function snapObjectToFloor(scene: IScene, object: IObject3D): Result<void> {
  try {
    const threeScene = toThreeScene(scene);
    if (!threeScene) {
      return Result.err(
        new ThreeViewerError(
          'Scene must be ThreeSceneAdapter',
          ErrorCode.INVALID_PARAMETER
        )
      );
    }

    const threeObject = toThreeObject(object);
    if (!threeObject) {
      return Result.err(
        new ThreeViewerError(
          'Object must expose a Three.js Object3D',
          ErrorCode.INVALID_PARAMETER
        )
      );
    }

    const isGridTagged = (obj: THREE.Object3D): boolean => {
      let current: THREE.Object3D | null = obj;
      while (current) {
        if (current.userData?.isGrid || current.userData?.isHexGrid || current.userData?.isDefaultGrid) {
          return true;
        }
        current = current.parent;
      }
      return false;
    };

    // The grid isn't the object being aligned, so nothing else guarantees
    // its matrixWorld is current — a stale (e.g. identity) transform would
    // silently throw the raycast hits off by whatever offset it's missing.
    threeScene.updateMatrixWorld(true);
    const gridMeshes: THREE.Mesh[] = [];
    threeScene.traverse((child) => {
      // Skip the tracer-only cyclorama: it is a tall shell whose walls would
      // drag floorTopY up to their rim and float the model, and it is a
      // path-tracing construct anyway — the real floor level is the raster
      // catcher, which the cove floor is separately aligned to.
      if (child.userData?.[PATH_TRACING_FLOOR_FLAG]) {
        return;
      }
      if ((child as THREE.Mesh).isMesh && isGridTagged(child)) {
        gridMeshes.push(child as THREE.Mesh);
      }
    });

    const objectMeshes: THREE.Mesh[] = [];
    threeObject.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        objectMeshes.push(child as THREE.Mesh);
      }
    });

    if (gridMeshes.length === 0 || objectMeshes.length === 0) {
      // No floor to drop onto (or nothing to drop) — leave the object where it is.
      return Result.ok(undefined);
    }

    // The floor's height only needs measuring once — every tile sits at
    // the same Y by construction — rather than raycasting against
    // potentially thousands of individual tiles on every sample below.
    let floorTopY = -Infinity;
    const tileBox = new THREE.Box3();
    for (const mesh of gridMeshes) {
      tileBox.setFromObject(mesh);
      if (Number.isFinite(tileBox.max.y)) {
        floorTopY = Math.max(floorTopY, tileBox.max.y);
      }
    }
    if (!Number.isFinite(floorTopY)) {
      return Result.ok(undefined);
    }

    const box = new THREE.Box3().setFromObject(threeObject);
    if (box.isEmpty() || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
      return Result.ok(undefined);
    }

    // Sample a dense grid of vertical rays across the object's own
    // footprint, raycasting only against its own (typically BVH-
    // accelerated) meshes — a coarse grid or a single center ray can
    // straddle a narrow true contact point (e.g. a wheel's tread) and
    // under-shoot how far the object actually needs to drop.
    //
    // Each sample casts in BOTH directions: glTF materials default to
    // single-sided, so the true contact surface — its normal facing DOWN,
    // outward — is backface-culled for a ray from above and only hittable
    // from below. Down-rays still catch up-facing bottom surfaces (ground
    // decals, open shells); the object's lowest point is the minimum over
    // both passes.
    const SAMPLES_PER_AXIS = 40;
    const margin = Math.max(1, box.max.y - box.min.y);
    const aboveY = box.max.y + margin;
    const belowY = box.min.y - margin;
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const up = new THREE.Vector3(0, 1, 0);

    let lowestObjectY = Infinity;
    const recordLowestHit = (originX: number, originY: number, originZ: number, direction: THREE.Vector3) => {
      raycaster.set(new THREE.Vector3(originX, originY, originZ), direction);
      for (const hit of raycaster.intersectObjects(objectMeshes, false)) {
        if (hit.point.y < lowestObjectY) {
          lowestObjectY = hit.point.y;
        }
      }
    };

    for (let i = 0; i <= SAMPLES_PER_AXIS; i++) {
      for (let j = 0; j <= SAMPLES_PER_AXIS; j++) {
        const x = box.min.x + (box.max.x - box.min.x) * (i / SAMPLES_PER_AXIS);
        const z = box.min.z + (box.max.z - box.min.z) * (j / SAMPLES_PER_AXIS);
        recordLowestHit(x, aboveY, z, down);
        recordLowestHit(x, belowY, z, up);
      }
    }

    // A tiny epsilon avoids nudging objects that are already touching
    // (floating point noise from the raycasts themselves).
    if (Number.isFinite(lowestObjectY)) {
      const gap = lowestObjectY - floorTopY;
      if (Math.abs(gap) > 1e-4) {
        threeObject.position.y -= gap;
      }
    }

    return Result.ok(undefined);
  } catch (error) {
    return Result.err(
      new ThreeViewerError(
        'Failed to snap object to floor',
        ErrorCode.SCENE_OPERATION_FAILED,
        { originalError: error }
      )
    );
  }
}
