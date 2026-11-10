import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';

export function fitCameraToObject(
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  controls: OrbitControls
): Result<void> {
  try {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);

    let fov: number;
    if ('fov' in camera) {
      fov = camera.fov * (Math.PI / 180);
    } else {
      fov = 50 * (Math.PI / 180);
    }

    let distance = Math.abs(maxDim / 2 / Math.tan(fov / 2));

    distance *= 1.65;

    const angle = -Math.PI / 4;
    const elevation = Math.PI / 8;

    const cameraX = center.x + distance * Math.sin(angle) * Math.cos(elevation);
    const cameraY = center.y + distance * Math.sin(elevation);
    const cameraZ = center.z + distance * Math.cos(angle) * Math.cos(elevation);

    camera.position.set(cameraX, cameraY, cameraZ);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    if (controls.target) {
      controls.target.copy(center);
      controls.update();
    }

    return Result.ok(undefined);
  } catch (error) {
    return Result.err(
      new ThreeViewerError(
        'Failed to fit camera to object',
        ErrorCode.CAMERA_INIT_FAILED,
        { originalError: error }
      )
    );
  }
}
