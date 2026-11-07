import * as THREE from 'three';
import { fitCoverBackgroundToViewport, markCoverFitBackground } from '../backgroundImageFit';
import { markViewerOwnedBackground } from '../backgroundOwnership';

const sceneWithBackground = (background: THREE.Scene['background']): THREE.Scene => {
  const scene = new THREE.Scene();
  scene.background = background;
  return scene;
};

const coverFitTexture = (image: unknown): THREE.Texture => {
  const texture = new THREE.Texture(image as HTMLImageElement);
  markCoverFitBackground(texture);
  return texture;
};

const expectUncropped = (texture: THREE.Texture) => {
  expect(texture.repeat.toArray()).toEqual([1, 1]);
  expect(texture.offset.toArray()).toEqual([0, 0]);
};

describe('fitCoverBackgroundToViewport', () => {
  it('crops the sides of an image wider than the viewport, centered', () => {
    const texture = coverFitTexture({ width: 1600, height: 900 });

    fitCoverBackgroundToViewport(sceneWithBackground(texture), 4 / 3);

    expect(texture.repeat.x).toBeCloseTo(0.75);
    expect(texture.repeat.y).toBeCloseTo(1);
    expect(texture.offset.x).toBeCloseTo(0.125);
    expect(texture.offset.y).toBeCloseTo(0);
  });

  it('crops the top and bottom of an image taller than the viewport, centered', () => {
    const texture = coverFitTexture({ width: 900, height: 1600 });

    fitCoverBackgroundToViewport(sceneWithBackground(texture), 16 / 9);

    expect(texture.repeat.x).toBeCloseTo(1);
    expect(texture.repeat.y).toBeCloseTo(81 / 256);
    expect(texture.offset.x).toBeCloseTo(0);
    expect(texture.offset.y).toBeCloseTo((1 - 81 / 256) / 2);
  });

  it('shows the whole image when it already matches the viewport aspect', () => {
    const texture = coverFitTexture({ width: 1920, height: 1080 });

    fitCoverBackgroundToViewport(sceneWithBackground(texture), 16 / 9);

    expect(texture.repeat.x).toBeCloseTo(1);
    expect(texture.repeat.y).toBeCloseTo(1);
    expect(texture.offset.x).toBeCloseTo(0);
    expect(texture.offset.y).toBeCloseTo(0);
  });

  it('measures an image element by its natural size, not its layout size', () => {
    const texture = coverFitTexture({ naturalWidth: 400, naturalHeight: 100, width: 50, height: 50 });

    fitCoverBackgroundToViewport(sceneWithBackground(texture), 1);

    expect(texture.repeat.x).toBeCloseTo(0.25);
    expect(texture.repeat.y).toBeCloseTo(1);
  });

  it('does not request a texture re-upload', () => {
    const texture = coverFitTexture({ width: 400, height: 100 });
    const versionBefore = texture.version;

    fitCoverBackgroundToViewport(sceneWithBackground(texture), 1);

    expect(texture.version).toBe(versionBefore);
  });

  it('leaves textures that are not uploaded background images alone', () => {
    const gradient = new THREE.CanvasTexture(document.createElement('canvas'));
    markViewerOwnedBackground(gradient);
    const consumerTexture = new THREE.Texture({ width: 400, height: 100 } as unknown as HTMLImageElement);

    fitCoverBackgroundToViewport(sceneWithBackground(gradient), 4);
    fitCoverBackgroundToViewport(sceneWithBackground(consumerTexture), 4);

    expectUncropped(gradient);
    expectUncropped(consumerTexture);
  });

  it('ignores color and empty backgrounds', () => {
    expect(() => fitCoverBackgroundToViewport(sceneWithBackground(new THREE.Color('#fff')), 1)).not.toThrow();
    expect(() => fitCoverBackgroundToViewport(sceneWithBackground(null), 1)).not.toThrow();
  });

  it.each([
    ['an image that has not decoded yet', { width: 0, height: 0 }],
    ['a texture without an image', null],
    ['an image with no height', { width: 400, height: 0 }],
  ])('keeps %s uncropped', (_label, image) => {
    const texture = coverFitTexture(image);

    fitCoverBackgroundToViewport(sceneWithBackground(texture), 2);

    expectUncropped(texture);
  });

  it.each([
    ['a zero-height viewport', Infinity],
    ['a zero-size viewport', NaN],
    ['a zero-width viewport', 0],
  ])('keeps the image uncropped for %s', (_label, viewportAspect) => {
    const texture = coverFitTexture({ width: 400, height: 100 });

    fitCoverBackgroundToViewport(sceneWithBackground(texture), viewportAspect);

    expectUncropped(texture);
  });
});
