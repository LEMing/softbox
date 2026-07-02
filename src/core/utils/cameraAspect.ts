import { ICamera } from '../interfaces/ICamera';

/** Update a perspective camera's aspect ratio and reproject. */
export function applyCameraAspect(camera: ICamera, aspect: number): void {
  if (camera.type === 'perspective' && 'aspect' in camera) {
    camera.aspect = aspect;
  }
  camera.updateProjectionMatrix();
}
