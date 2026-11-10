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

    threeScene.updateMatrixWorld(true);
    const gridMeshes: THREE.Mesh[] = [];
    threeScene.traverse((child) => {
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
      return Result.ok(undefined);
    }

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
