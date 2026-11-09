import * as THREE from 'three';

const COVER_FIT_BACKGROUND_FLAG = 'softboxCoverFitBackground';

interface IntrinsicSize {
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
}

export function markCoverFitBackground(texture: THREE.Texture): void {
  texture.userData[COVER_FIT_BACKGROUND_FLAG] = true;
}

export function fitCoverBackgroundToViewport(scene: THREE.Scene, viewportAspect: number): void {
  const background = scene.background;
  if (!isCoverFitBackground(background)) {
    return;
  }
  const imageAspect = intrinsicAspect(background.image as IntrinsicSize | null);
  if (!isUsableAspect(imageAspect) || !isUsableAspect(viewportAspect)) {
    return;
  }
  background.repeat.set(
    Math.min(1, viewportAspect / imageAspect),
    Math.min(1, imageAspect / viewportAspect)
  );
  background.offset.set((1 - background.repeat.x) / 2, (1 - background.repeat.y) / 2);
}

function isCoverFitBackground(background: THREE.Scene['background']): background is THREE.Texture {
  return background instanceof THREE.Texture && background.userData[COVER_FIT_BACKGROUND_FLAG] === true;
}

function intrinsicAspect(image: IntrinsicSize | null): number {
  const width = image?.naturalWidth || image?.width || 0;
  const height = image?.naturalHeight || image?.height || 0;
  return width / height;
}

function isUsableAspect(aspect: number): boolean {
  return Number.isFinite(aspect) && aspect > 0;
}
