import * as THREE from 'three';

const VIEWER_OWNED_BACKGROUND_FLAG = 'softboxOwnedBackground';

export function markViewerOwnedBackground(texture: THREE.Texture): void {
  texture.userData[VIEWER_OWNED_BACKGROUND_FLAG] = true;
}

export function disposeViewerOwnedBackground(scene: THREE.Scene): void {
  const previous = scene.background;
  if (
    previous instanceof THREE.Texture &&
    previous.userData?.[VIEWER_OWNED_BACKGROUND_FLAG] &&
    previous !== scene.environment
  ) {
    previous.dispose();
  }
}
