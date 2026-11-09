import * as THREE from 'three';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { findDirectionalLight } from './findDirectionalLight';

export function fitShadowCameraToObject(scene: THREE.Scene, object: THREE.Object3D): Result<void> {
  try {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty() || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
      return Result.ok(undefined);
    }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const directionalLight = findDirectionalLight(scene);
    if (!directionalLight || !directionalLight.castShadow) {
      return Result.ok(undefined);
    }

    const isViewerRig =
      directionalLight.parent === scene && directionalLight.target.parent === scene;
    if (isViewerRig) {
      const lightDirection = directionalLight.position.clone().sub(directionalLight.target.position);
      directionalLight.target.position.copy(center);
      directionalLight.position.copy(center).add(lightDirection);
    }

    const PADDING_FACTOR = 2;
    const MIN_HALF_EXTENT = 0.1;
    const halfExtent = Math.max(size.x, size.y, size.z, MIN_HALF_EXTENT) * PADDING_FACTOR;

    const shadowCamera = directionalLight.shadow.camera;
    shadowCamera.left = -halfExtent;
    shadowCamera.right = halfExtent;
    shadowCamera.top = halfExtent;
    shadowCamera.bottom = -halfExtent;
    const lightWorld = directionalLight.getWorldPosition(new THREE.Vector3());
    const targetWorld = directionalLight.target.getWorldPosition(new THREE.Vector3());
    const viewDirection = targetWorld.sub(lightWorld).normalize();
    const centerDepth = center.clone().sub(lightWorld).dot(viewDirection);
    const depthPadding = halfExtent * 2;
    shadowCamera.near = Math.max(centerDepth - depthPadding, centerDepth * 0.01);
    shadowCamera.far = centerDepth + depthPadding;
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
