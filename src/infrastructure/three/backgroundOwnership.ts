import * as THREE from 'three';

/**
 * Ownership tag for scene backgrounds the viewer itself painted (gradient
 * canvases, uploaded background images). Replacing a background must dispose
 * ONLY these: an environment-map backdrop is the cached equirect original the
 * texture cache and the path tracer still hold, and disposing it on a repaint
 * defeats the cache and drops the tracer's ingest source to a GPU re-upload.
 */
const VIEWER_OWNED_BACKGROUND_FLAG = 'softboxOwnedBackground';

export function markViewerOwnedBackground(texture: THREE.Texture): void {
  texture.userData[VIEWER_OWNED_BACKGROUND_FLAG] = true;
}

/** Dispose the scene's current background iff the viewer painted it AND it
 * is not aliased as the environment map (studio mode can share one texture
 * for both — the environment side must survive a backdrop repaint). */
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
