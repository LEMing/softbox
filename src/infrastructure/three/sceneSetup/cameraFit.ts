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

    // Narrowing to the two concrete kinds (instead of accepting any
    // THREE.Camera) is what makes updateProjectionMatrix below safe —
    // the base class doesn't have it.
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

    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(threeObject);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());


    // Get the max dimension
    const maxDim = Math.max(size.x, size.y, size.z);

    // Check if it's a perspective camera and get FOV
    let fov: number;
    if ('fov' in threeCamera) {
      fov = threeCamera.fov * (Math.PI / 180);
    } else {
      // For orthographic camera, use a default FOV equivalent
      fov = 50 * (Math.PI / 180);
    }

    // Calculate distance needed to fit object in view
    let distance = Math.abs(maxDim / 2 / Math.tan(fov / 2));

    // Breathing room beyond an exact fit (~65% extra): a tighter hero crop than
    // the old 2.0x, which left the subject filling only about half the frame.
    distance *= 1.65;

    // Left-front view at eye level
    // Angle: -45 degrees (315 degrees) for left-front
    const angle = -Math.PI / 4; // -45 degrees (left-front)
    const elevation = Math.PI / 8; // 22.5 degrees up (more eye level)

    // Calculate camera position at the desired distance
    const cameraX = center.x + distance * Math.sin(angle) * Math.cos(elevation);
    const cameraY = center.y + distance * Math.sin(elevation);
    const cameraZ = center.z + distance * Math.cos(angle) * Math.cos(elevation);

    // Update camera
    threeCamera.position.set(cameraX, cameraY, cameraZ);
    threeCamera.lookAt(center);
    threeCamera.updateProjectionMatrix();

    // Update controls target to look at object center
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
