import * as THREE from 'three';
import { createGradientBackground } from '../gradientBackground';
import { IScene } from '../../../../core/interfaces/IScene';
import { ErrorCode } from '../../../../errors';

/** createGradientBackground unwraps a raw three Scene at runtime; cast for TS. */
const paint = (
  scene: unknown,
  options: Parameters<typeof createGradientBackground>[1]
) => createGradientBackground(scene as IScene, options);

/**
 * jsdom ships no 2D canvas, so `getContext('2d')` returns null by default and
 * the real gradient code never runs. Stub it with a fake context that records
 * which gradient factory was used and the colour stops it received.
 */
function stubCanvas2D() {
  const gradient = { addColorStop: jest.fn() };
  const context = {
    createLinearGradient: jest.fn(() => gradient),
    createRadialGradient: jest.fn(() => gradient),
    fillRect: jest.fn(),
    fillStyle: '' as unknown,
  };
  const canvases: HTMLCanvasElement[] = [];
  const spy = jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(function (this: HTMLCanvasElement) {
      canvases.push(this);
      return context as unknown as CanvasRenderingContext2D;
    });
  return { gradient, context, canvases, spy };
}

describe('createGradientBackground', () => {
  afterEach(() => jest.restoreAllMocks());

  it('paints a flat vertical gradient on a thin strip by default', () => {
    const { context, canvases } = stubCanvas2D();
    const scene = new THREE.Scene();

    const result = paint(scene, { topColor: '#111', bottomColor: '#111' });

    expect(result.ok).toBe(true);
    expect(context.createLinearGradient).toHaveBeenCalledWith(0, 0, 0, 512);
    expect(context.createRadialGradient).not.toHaveBeenCalled();
    expect(canvases[0].width).toBe(2);
    expect(scene.background).toBeInstanceOf(THREE.CanvasTexture);
  });

  it('paints a radial studio vignette on a square canvas when radial is set', () => {
    const { gradient, context, canvases } = stubCanvas2D();
    const scene = new THREE.Scene();

    const result = paint(scene, {
      topColor: '#242430',
      bottomColor: '#050507',
      radial: true,
    });

    expect(result.ok).toBe(true);
    // Centre lifted above the middle, outer radius reaching the corners.
    expect(context.createRadialGradient).toHaveBeenCalledWith(256, 205, 0, 256, 256, 380);
    expect(context.createLinearGradient).not.toHaveBeenCalled();
    expect(canvases[0].width).toBe(512);
    expect(canvases[0].height).toBe(512);
    // Centre colour behind the subject, darker edge in the corners.
    expect(gradient.addColorStop).toHaveBeenCalledWith(0, '#242430');
    expect(gradient.addColorStop).toHaveBeenCalledWith(1, '#050507');
    expect(scene.background).toBeInstanceOf(THREE.CanvasTexture);
  });

  it('disposes the previous background texture on a repeated paint', () => {
    stubCanvas2D();
    const scene = new THREE.Scene();

    paint(scene, { topColor: '#111', bottomColor: '#111' });
    const first = scene.background as THREE.CanvasTexture;
    const disposeSpy = jest.spyOn(first, 'dispose');

    paint(scene, { topColor: '#222', bottomColor: '#222' });

    expect(disposeSpy).toHaveBeenCalled();
    expect(scene.background).not.toBe(first);
  });

  it('keeps the previous texture when it is still in use as the environment', () => {
    stubCanvas2D();
    const scene = new THREE.Scene();

    paint(scene, { topColor: '#111', bottomColor: '#111' });
    const shared = scene.background as THREE.CanvasTexture;
    scene.environment = shared;
    const disposeSpy = jest.spyOn(shared, 'dispose');

    paint(scene, { topColor: '#222', bottomColor: '#222' });

    expect(disposeSpy).not.toHaveBeenCalled();
  });

  it('errors when the scene is not a three scene', () => {
    const result = paint({}, { topColor: '#111', bottomColor: '#111' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.INVALID_PARAMETER);
    }
  });

  it('errors when a 2D context cannot be created', () => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const result = paint(new THREE.Scene(), {
      topColor: '#111',
      bottomColor: '#111',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.SCENE_OPERATION_FAILED);
    }
  });
});
