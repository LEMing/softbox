import * as THREE from 'three';
import { IScene } from '../../../core/interfaces/IScene';
import { IObject3D } from '../../../core/interfaces/IObject3D';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { toThreeObject, toThreeScene } from '../unwrap';
import { findDirectionalLight } from './findDirectionalLight';

export function fitShadowCameraToObject(scene: IScene, object: IObject3D): Result<void> {
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

    const box = new THREE.Box3().setFromObject(threeObject);
    if (box.isEmpty() || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
      return Result.ok(undefined);
    }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const directionalLight = findDirectionalLight(threeScene);
    if (!directionalLight || !directionalLight.castShadow) {
      return Result.ok(undefined);
    }

    // The frustum below is centered on the light's own axis (position →
    // target), which aims at the ORIGIN — for an off-origin model the
    // fitted frustum misses it entirely and every shadow vanishes. Re-aim
    // the whole rig at the model: shift the position by the same delta as
    // the target, preserving the configured light DIRECTION (and thus the
    // shadow's look) and staying idempotent across successive loads.
    // Only the viewer's own rig (light AND target sitting at the scene
    // root) is re-aimed: a light embedded in the loaded model holds
    // parent-space coordinates, and writing world-space centers into
    // those would scramble the author's lighting.
    const isViewerRig =
      directionalLight.parent === threeScene && directionalLight.target.parent === threeScene;
    if (isViewerRig) {
      const lightDirection = directionalLight.position.clone().sub(directionalLight.target.position);
      directionalLight.target.position.copy(center);
      directionalLight.position.copy(center).add(lightDirection);
    }

    // Generous padding (matching the floor grid's own scaleFactor) so the
    // shadow — which can fall outside the object's own footprint at an
    // angle — isn't clipped by a frustum sized tightly to the object.
    const PADDING_FACTOR = 2;
    const MIN_HALF_EXTENT = 0.1;
    const halfExtent = Math.max(size.x, size.y, size.z, MIN_HALF_EXTENT) * PADDING_FACTOR;

    const shadowCamera = directionalLight.shadow.camera;
    shadowCamera.left = -halfExtent;
    shadowCamera.right = halfExtent;
    shadowCamera.top = halfExtent;
    shadowCamera.bottom = -halfExtent;
    shadowCamera.updateProjectionMatrix();

    return Result.ok(undefined);
  } catch (error) {
    return Result.err(
      new ThreeViewerError(
        'Failed to fit shadow camera to object',
        ErrorCode.SCENE_OPERATION_FAILED,
        { originalError: error }
      )
    );
  }
}
