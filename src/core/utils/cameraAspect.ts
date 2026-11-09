import type * as THREE from 'three';

export function applyCameraAspect(camera: THREE.PerspectiveCamera, aspect: number): void {
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
