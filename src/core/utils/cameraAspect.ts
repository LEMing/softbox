import { ICamera } from '../interfaces/ICamera';

export function applyCameraAspect(camera: ICamera, aspect: number): void {
  if (camera.type === 'perspective' && 'aspect' in camera) {
    camera.aspect = aspect;
  }
  camera.updateProjectionMatrix();
}
