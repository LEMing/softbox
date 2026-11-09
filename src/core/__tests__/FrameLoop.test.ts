import * as THREE from 'three';
import { FrameLoop, FrameLoopDependencies } from '../FrameLoop';
import { StateManager } from '../managers/StateManager';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { ViewerEventMap } from '../events/CoreViewerEvents';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';

const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 3; i += 1) {
    await Promise.resolve();
  }
};

const makeBundle = (config: {
  initialized?: boolean;
  withAnimation?: boolean;
  animating?: boolean;
  controlsChanged?: boolean;
  controlsEnabled?: boolean;
  pathTracedRender?: Promise<Result<void>> | null;
  rasterResult?: Result<void>;
} = {}) => {
  const state = { running: false, disposed: false, screenshotActive: false, rendererDisposed: false };
  let tick: ((deltaTime: number) => void) | null = null;
  const renderLoopManager = {
    start: jest.fn((callback: (deltaTime: number) => void) => {
      tick = callback;
      state.running = true;
    }),
    stop: jest.fn(() => {
      state.running = false;
    }),
    isRunning: jest.fn(() => state.running),
    requestRender: jest.fn(),
  };
  const renderer = {
    isDisposed: jest.fn(() => state.rendererDisposed),
    renderPostProcessed: jest.fn(() => config.rasterResult ?? Result.ok(undefined)),
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const listeners: Array<() => void> = [];
  const controls = {
    enabled: config.controlsEnabled ?? true,
    update: jest.fn(() => config.controlsChanged ?? false),
    addEventListener: jest.fn((_type: string, listener: () => void) => listeners.push(listener)),
    removeEventListener: jest.fn(),
  };
  const events = new TypedEventEmitter<ViewerEventMap>();
  const stateManager = new StateManager();
  if (config.initialized ?? true) {
    stateManager.setInitialized();
  }
  const frameState = { wasActive: false, samples: 0 };
  const pathTracing = {
    resetAccumulation: jest.fn(),
    suspendWhileAnimating: jest.fn(),
    beforeFrame: jest.fn(() => frameState),
    render: jest.fn(() => config.pathTracedRender ?? null),
    detectCompletion: jest.fn(),
    getSampleCount: jest.fn(() => 7),
  };
  const animationService = {
    isPlaying: jest.fn(() => config.animating ?? false),
    update: jest.fn(),
  };

  const loop = new FrameLoop({
    renderLoopManager,
    renderer,
    scene,
    camera,
    controls,
    events,
    stateManager,
    pathTracing,
    animationService: config.withAnimation === false ? undefined : animationService,
    isScreenshotActive: () => state.screenshotActive,
    isDisposed: () => state.disposed,
  } as unknown as FrameLoopDependencies);

  const runTick = (deltaTime = 16) => tick!(deltaTime);

  return {
    loop, state, renderLoopManager, renderer, scene, camera, controls, listeners, events,
    stateManager, pathTracing, animationService, frameState, runTick,
  };
};

describe('FrameLoop lifecycle', () => {
  it('starts the render loop and reports whether it runs', () => {
    const b = makeBundle();

    expect(b.loop.isRunning()).toBe(false);
    b.loop.start();

    expect(b.renderLoopManager.start).toHaveBeenCalledTimes(1);
    expect(b.loop.isRunning()).toBe(true);
  });

  it('revives a wound-down loop only once the viewer is initialized', () => {
    const uninitialized = makeBundle({ initialized: false });
    uninitialized.loop.revive();
    expect(uninitialized.renderLoopManager.start).not.toHaveBeenCalled();

    const initialized = makeBundle();
    initialized.loop.revive();
    initialized.loop.revive();
    expect(initialized.renderLoopManager.start).toHaveBeenCalledTimes(1);
  });

  it('repaints by reviving and requesting a frame', () => {
    const b = makeBundle();

    b.loop.repaint();

    expect(b.renderLoopManager.start).toHaveBeenCalled();
    expect(b.renderLoopManager.requestRender).toHaveBeenCalled();
  });

  it('resumes even before initialization and requests a frame', () => {
    const b = makeBundle({ initialized: false });

    b.loop.resume();
    b.loop.resume();

    expect(b.renderLoopManager.start).toHaveBeenCalledTimes(1);
    expect(b.renderLoopManager.requestRender).toHaveBeenCalledTimes(2);
  });

  it('repaints on a controls change until disposed and unsubscribes on dispose', () => {
    const b = makeBundle();
    b.loop.wakeOnControlsChange();

    b.listeners[0]();
    expect(b.renderLoopManager.requestRender).toHaveBeenCalledTimes(1);

    b.state.disposed = true;
    b.listeners[0]();
    expect(b.renderLoopManager.requestRender).toHaveBeenCalledTimes(1);

    b.loop.dispose();
    b.loop.dispose();
    expect(b.renderLoopManager.stop).toHaveBeenCalledTimes(2);
    expect(b.controls.removeEventListener).toHaveBeenCalledTimes(1);
    expect(b.controls.removeEventListener).toHaveBeenCalledWith('change', b.listeners[0]);
  });

  it('renders a raster frame through post-processing', () => {
    const b = makeBundle();

    expect(b.loop.renderRaster().ok).toBe(true);
    expect(b.renderer.renderPostProcessed).toHaveBeenCalledWith(b.scene, b.camera);
  });
});

describe('FrameLoop tick', () => {
  it('stops itself once the viewer is disposed or the renderer is gone', () => {
    const disposed = makeBundle();
    disposed.loop.start();
    disposed.state.disposed = true;
    disposed.runTick();
    expect(disposed.renderLoopManager.stop).toHaveBeenCalled();

    const rendererGone = makeBundle();
    rendererGone.loop.start();
    rendererGone.state.rendererDisposed = true;
    rendererGone.runTick();
    expect(rendererGone.renderLoopManager.stop).toHaveBeenCalled();
    expect(rendererGone.pathTracing.beforeFrame).not.toHaveBeenCalled();
  });

  it('skips frames before initialization and in the error state', () => {
    const b = makeBundle({ initialized: false });
    b.loop.start();
    b.runTick();

    const errored = makeBundle();
    errored.loop.start();
    errored.stateManager.setError(new ThreeViewerError('x', ErrorCode.OPERATION_FAILED));
    errored.runTick();

    expect(b.pathTracing.beforeFrame).not.toHaveBeenCalled();
    expect(errored.pathTracing.beforeFrame).not.toHaveBeenCalled();
    expect(errored.renderLoopManager.stop).not.toHaveBeenCalled();
  });

  it('renders a raster frame and reports render info and completion', async () => {
    const b = makeBundle();
    const completed = jest.fn();
    b.events.on('render:complete', completed);
    b.loop.start();

    b.runTick(20);
    await flushPromises();

    expect(b.renderer.renderPostProcessed).toHaveBeenCalledWith(b.scene, b.camera);
    expect(b.pathTracing.detectCompletion).toHaveBeenCalledWith(b.frameState, expect.any(Number));
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ frame: 1, samples: 7 }));
    expect(b.stateManager.getState().renderInfo).toEqual(
      expect.objectContaining({ frameCount: 1, fps: 50 })
    );
  });

  it('reports zero fps for a zero-length frame', () => {
    const b = makeBundle();
    b.loop.start();

    b.runTick(0);

    expect(b.stateManager.getState().renderInfo).toEqual(expect.objectContaining({ fps: 0 }));
  });

  it('prefers the path-traced render when one is active', async () => {
    const b = makeBundle({ pathTracedRender: Promise.resolve(Result.ok(undefined)) });
    b.loop.start();

    b.runTick();
    await flushPromises();

    expect(b.pathTracing.render).toHaveBeenCalledWith(b.scene, b.camera);
    expect(b.renderer.renderPostProcessed).not.toHaveBeenCalled();
  });

  it('emits an error for a failed frame', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new ThreeViewerError('gl lost', ErrorCode.RENDER_FAILED);
    const b = makeBundle({ rasterResult: Result.err(error) });
    const onError = jest.fn();
    const completed = jest.fn();
    b.events.on('error', onError);
    b.events.on('render:complete', completed);
    b.loop.start();

    b.runTick();
    await flushPromises();

    expect(onError).toHaveBeenCalledWith({ error });
    expect(completed).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('logs a frame that throws instead of breaking the loop', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const b = makeBundle({ pathTracedRender: Promise.reject(new Error('boom')) });
    b.loop.start();

    b.runTick();
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith('[ViewerCore] Render frame error:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('holds the frame while a screenshot stands in for the scene', async () => {
    const b = makeBundle();
    b.state.screenshotActive = true;
    b.loop.start();

    b.runTick();
    await flushPromises();

    expect(b.renderer.renderPostProcessed).not.toHaveBeenCalled();
    expect(b.pathTracing.detectCompletion).toHaveBeenCalled();
  });

  it('emits a controls change, restarts accumulation and requests a frame', () => {
    const b = makeBundle({ controlsChanged: true });
    const onChange = jest.fn();
    b.events.on('controls:change', onChange);
    b.loop.start();

    b.runTick();

    expect(onChange).toHaveBeenCalledWith({ controls: b.controls });
    expect(b.pathTracing.resetAccumulation).toHaveBeenCalledWith();
    expect(b.renderLoopManager.requestRender).toHaveBeenCalled();
  });

  it('ignores disabled controls', () => {
    const b = makeBundle({ controlsEnabled: false, controlsChanged: true });
    b.loop.start();

    b.runTick();

    expect(b.controls.update).not.toHaveBeenCalled();
  });

  it('advances animation in seconds and keeps accumulation while animating', () => {
    const b = makeBundle({ animating: true, controlsChanged: true });
    b.loop.start();

    b.runTick(500);

    expect(b.animationService.update).toHaveBeenCalledWith(0.5);
    expect(b.pathTracing.suspendWhileAnimating).toHaveBeenCalled();
    expect(b.pathTracing.resetAccumulation).not.toHaveBeenCalled();
  });

  it('runs without an animation service', () => {
    const b = makeBundle({ withAnimation: false });
    b.loop.start();

    expect(() => b.runTick()).not.toThrow();
    expect(b.pathTracing.suspendWhileAnimating).not.toHaveBeenCalled();
  });
});
