import * as THREE from 'three';
import { IObject3D } from '../../../core/interfaces/IObject3D';
import { ICamera } from '../../../core/interfaces/ICamera';
import { IControls } from '../../../core/interfaces/IControls';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { toThreeCamera, toThreeControls, toThreeObject } from '../unwrap';

export function fitCameraToObject(object: IObject3D, camera: ICamera, controls: IControls): Result<void> {
  try {
    const threeObject = toThreeObject(object);
    if (!threeObject) {
      return Result.err(
        new ThreeViewerError(
          'Object must expose a Three.js Object3D',
          ErrorCode.INVALID_PARAMETER
        )
      );
    }

    const threeCamera = toThreeCamera(camera);
    if (
      !(threeCamera instanceof THREE.PerspectiveCamera) &&
      !(threeCamera instanceof THREE.OrthographicCamera)
    ) {
      return Result.err(
        new ThreeViewerError(
          'Camera must expose a perspective or orthographic Three.js camera',
          ErrorCode.INVALID_PARAMETER
        )
      );
    }

    const threeControls = toThreeControls(controls);
    if (!threeControls) {
      return Result.err(
        new ThreeViewerError(
          'Controls must expose the underlying Three.js controls',
          ErrorCode.INVALID_PARAMETER
        )
      );
    }

    const box = new THREE.Box3().setFromObject(threeObject);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());


    const maxDim = Math.max(size.x, size.y, size.z);

    let fov: number;
    if ('fov' in threeCamera) {
      fov = threeCamera.fov * (Math.PI / 180);
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

    threeCamera.position.set(cameraX, cameraY, cameraZ);
    threeCamera.lookAt(center);
    threeCamera.updateProjectionMatrix();

    if (threeControls.target) {
      threeControls.target.copy(center);
      threeControls.update();
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
