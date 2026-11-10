import * as THREE from 'three';
import { ViewportResizer, ViewportResizerDependencies } from '../ViewportResizer';

const makeBundle = (config: { canvasWidth?: number; canvasHeight?: number; aspect?: number; pixelRatio?: number } = {}) => {
  const canvas = document.createElement('canvas');
  canvas.width = config.canvasWidth ?? 800;
  canvas.height = config.canvasHeight ?? 600;
  const renderer = {
    getDomElement: jest.fn(() => canvas),
    getPixelRatio: jest.fn(() => config.pixelRatio ?? 1),
    setSize: jest.fn(),
  };
  const camera = new THREE.PerspectiveCamera(30, config.aspect ?? 800 / 600);
  const pathTracing = { resetAccumulation: jest.fn() };
  const frameLoop = { renderRaster: jest.fn(), repaint: jest.fn() };
  const state = { disposed: false };

  const resizer = new ViewportResizer({
    renderer,
    camera,
    pathTracing,
    frameLoop,
    isDisposed: () => state.disposed,
  } as unknown as ViewportResizerDependencies);

  return { resizer, renderer, camera, pathTracing, frameLoop, state };
};

describe('ViewportResizer', () => {
  it('does nothing when canvas size and camera aspect already match', () => {
    const b = makeBundle();

    b.resizer.resize(800, 600);

    expect(b.renderer.setSize).not.toHaveBeenCalled();
    expect(b.frameLoop.repaint).not.toHaveBeenCalled();
  });

  it('resizes the canvas, fixes the aspect, paints at once and repaints the loop', () => {
    const b = makeBundle();

    b.resizer.resize(1024, 512);

    expect(b.camera.aspect).toBeCloseTo(2);
    expect(b.renderer.setSize).toHaveBeenCalledWith(1024, 512);
    expect(b.frameLoop.renderRaster).toHaveBeenCalled();
    expect(b.pathTracing.resetAccumulation).toHaveBeenCalledWith();
    expect(b.frameLoop.repaint).toHaveBeenCalled();
  });

  it('only corrects the aspect when the canvas already has the right size', () => {
    const b = makeBundle({ aspect: 1 });

    b.resizer.resize(800, 600);

    expect(b.camera.aspect).toBeCloseTo(800 / 600);
    expect(b.renderer.setSize).not.toHaveBeenCalled();
    expect(b.frameLoop.repaint).toHaveBeenCalled();
  });

  it('compares against the canvas in device pixels', () => {
    const b = makeBundle({ canvasWidth: 1600, canvasHeight: 1200, pixelRatio: 2 });

    b.resizer.resize(800, 600);

    expect(b.renderer.setSize).not.toHaveBeenCalled();
  });

  it('survives a throwing immediate paint', () => {
    const b = makeBundle();
    b.frameLoop.renderRaster.mockImplementation(() => {
      throw new Error('context lost');
    });

    expect(() => b.resizer.resize(400, 400)).not.toThrow();
    expect(b.frameLoop.repaint).toHaveBeenCalled();
  });

  it('ignores resizes after dispose', () => {
    const b = makeBundle();
    b.state.disposed = true;

    b.resizer.resize(1024, 512);

    expect(b.renderer.getDomElement).not.toHaveBeenCalled();
    expect(b.renderer.setSize).not.toHaveBeenCalled();
  });
});
