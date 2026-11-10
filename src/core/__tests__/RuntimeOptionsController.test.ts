import * as THREE from 'three';
import { RuntimeOptionsController, RuntimeOptionsControllerDependencies } from '../RuntimeOptionsController';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { ViewerEventMap } from '../events/CoreViewerEvents';
import { ErrorCode } from '../../errors';

const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 3; i += 1) {
    await Promise.resolve();
  }
};

const makeBundle = (config: {
  options?: SimpleViewerOptions;
  hasModel?: boolean;
  enableRuntime?: jest.Mock;
} = {}) => {
  let options: SimpleViewerOptions = config.options ?? {};
  const state = { disposed: false };
  const renderer = { setToneMappingExposure: jest.fn(), setPostProcessing: jest.fn() };
  const scene = new THREE.Scene();
  const controls = { autoRotate: false, autoRotateSpeed: 2 };
  const events = new TypedEventEmitter<ViewerEventMap>();
  const renderLoopManager = { requireContinuous: jest.fn(), releaseContinuous: jest.fn() };
  const pathTracing = {
    resetAccumulation: jest.fn(),
    enableRuntime: config.enableRuntime ?? jest.fn(async () => true),
    disableRuntime: jest.fn(),
  };
  const capture = { notifyTurntableEnabled: jest.fn() };
  const environment = { applyBackgroundColor: jest.fn() };
  const animations = { pause: jest.fn(), autoplay: jest.fn(), setSpeed: jest.fn() };
  const variants = { selectOrWarn: jest.fn() };
  const repaint = jest.fn();

  const controller = new RuntimeOptionsController({
    renderer,
    scene,
    controls,
    events,
    renderLoopManager,
    pathTracing,
    capture,
    environment,
    animations,
    variants,
    hasModel: () => config.hasModel ?? true,
    getOptions: () => options,
    setOptions: (next: SimpleViewerOptions) => {
      options = next;
    },
    isDisposed: () => state.disposed,
    repaint,
  } as unknown as RuntimeOptionsControllerDependencies);

  return {
    controller, state, renderer, scene, controls, events, renderLoopManager, pathTracing,
    capture, environment, animations, variants, repaint, getOptions: () => options,
  };
};

describe('RuntimeOptionsController merging', () => {
  it('ignores updates after dispose', () => {
    const b = makeBundle();
    b.state.disposed = true;

    b.controller.apply({ renderer: { toneMappingExposure: 2 } });

    expect(b.getOptions()).toEqual({});
    expect(b.renderer.setToneMappingExposure).not.toHaveBeenCalled();
  });

  it('deep-merges the update into the stored options', () => {
    const b = makeBundle({ options: { controls: { autoRotate: false, autoRotateSpeed: 1 } } });

    b.controller.apply({ controls: { autoRotateSpeed: 4 } });

    expect(b.getOptions().controls).toEqual({ autoRotate: false, autoRotateSpeed: 4 });
  });

  it('lets an explicit undefined clear the background edge and the colour grade', () => {
    const b = makeBundle({
      options: { backgroundColorEdge: '#000000', renderer: { colorGrade: { saturation: 1.2 } } },
    });

    b.controller.apply({ backgroundColorEdge: undefined, renderer: { colorGrade: undefined } });

    expect(b.getOptions().backgroundColorEdge).toBeUndefined();
    expect(b.getOptions().renderer?.colorGrade).toBeUndefined();
  });
});

describe('RuntimeOptionsController background', () => {
  it('repaints the background and restarts accumulation when the colour changed', () => {
    const b = makeBundle({ options: { backgroundColor: '#111111' } });

    b.controller.apply({ backgroundColor: '#222222' });

    expect(b.environment.applyBackgroundColor).toHaveBeenCalledWith('#222222');
    expect(b.pathTracing.resetAccumulation).toHaveBeenCalledWith(true);
    expect(b.repaint).not.toHaveBeenCalled();
  });

  it('keeps accumulation for an unchanged colour or under an environment map', () => {
    const unchanged = makeBundle({ options: { backgroundColor: '#111111' } });
    unchanged.controller.apply({ backgroundColor: '#111111' });

    const mapped = makeBundle({ options: { backgroundColor: '#111111', environment: { url: 'a.hdr' } } });
    mapped.controller.apply({ backgroundColor: '#222222' });

    expect(unchanged.environment.applyBackgroundColor).toHaveBeenCalled();
    expect(unchanged.pathTracing.resetAccumulation).not.toHaveBeenCalled();
    expect(mapped.pathTracing.resetAccumulation).not.toHaveBeenCalled();
  });

  it('needs a base colour before an edge colour can repaint', () => {
    const b = makeBundle();

    b.controller.apply({ backgroundColorEdge: '#000000' });

    expect(b.environment.applyBackgroundColor).not.toHaveBeenCalled();
  });
});

describe('RuntimeOptionsController renderer look', () => {
  it('applies exposure and repaints', () => {
    const b = makeBundle();

    b.controller.apply({ renderer: { toneMappingExposure: 1.5 } });

    expect(b.renderer.setToneMappingExposure).toHaveBeenCalledWith(1.5);
    expect(b.renderer.setPostProcessing).not.toHaveBeenCalled();
    expect(b.repaint).toHaveBeenCalledTimes(1);
  });

  it('rebuilds post-processing only when an effect toggled', () => {
    const b = makeBundle({ options: { renderer: { bloom: false } } });

    b.controller.apply({ renderer: { bloom: true } });
    b.controller.apply({ renderer: { bloom: true } });

    expect(b.renderer.setPostProcessing).toHaveBeenCalledTimes(1);
    expect(b.renderer.setPostProcessing).toHaveBeenCalledWith({
      bloom: true,
      vignette: false,
      filmGrain: false,
      colorGrade: false,
    });
    expect(b.pathTracing.resetAccumulation).toHaveBeenCalledWith(true);
  });

  it('applies environment intensity and restarts accumulation only on a new value', () => {
    const b = makeBundle({ options: { environment: { environmentIntensity: 1 } } });

    b.controller.apply({ environment: { environmentIntensity: 1 } });
    expect(b.scene.environmentIntensity).toBe(1);
    expect(b.pathTracing.resetAccumulation).not.toHaveBeenCalled();

    b.controller.apply({ environment: { environmentIntensity: 0.4 } });
    expect(b.scene.environmentIntensity).toBe(0.4);
    expect(b.pathTracing.resetAccumulation).toHaveBeenCalledWith(true);
    expect(b.repaint).toHaveBeenCalledTimes(2);
  });
});

describe('RuntimeOptionsController turntable', () => {
  it('starts the turntable, keeps the loop continuous and tells capture', () => {
    const b = makeBundle();

    b.controller.apply({ controls: { autoRotate: true } });

    expect(b.controls.autoRotate).toBe(true);
    expect(b.renderLoopManager.requireContinuous).toHaveBeenCalledWith('turntable');
    expect(b.capture.notifyTurntableEnabled).toHaveBeenCalled();
    expect(b.repaint).toHaveBeenCalled();
  });

  it('stops the turntable and releases the loop', () => {
    const b = makeBundle({ options: { controls: { autoRotate: true } } });

    b.controller.apply({ controls: { autoRotate: false } });

    expect(b.controls.autoRotate).toBe(false);
    expect(b.renderLoopManager.releaseContinuous).toHaveBeenCalledWith('turntable');
  });

  it('ignores an unchanged autoRotate but applies the speed', () => {
    const b = makeBundle({ options: { controls: { autoRotate: true } } });

    b.controller.apply({ controls: { autoRotate: true, autoRotateSpeed: 6 } });

    expect(b.renderLoopManager.requireContinuous).not.toHaveBeenCalled();
    expect(b.controls.autoRotateSpeed).toBe(6);
    expect(b.repaint).toHaveBeenCalledTimes(1);
  });
});

describe('RuntimeOptionsController animations', () => {
  it('autoplays on a loaded model when autoplay turns on', () => {
    const b = makeBundle();

    b.controller.apply({ animations: { autoplay: 'Walk' } });

    expect(b.animations.autoplay).toHaveBeenCalledWith('Walk');
    expect(b.repaint).toHaveBeenCalled();
  });

  it('waits for a model before autoplaying', () => {
    const b = makeBundle({ hasModel: false });

    b.controller.apply({ animations: { autoplay: true } });

    expect(b.animations.autoplay).not.toHaveBeenCalled();
    expect(b.repaint).toHaveBeenCalled();
  });

  it('pauses when autoplay turns off and ignores an unchanged value', () => {
    const b = makeBundle({ options: { animations: { autoplay: true } } });

    b.controller.apply({ animations: { autoplay: true } });
    expect(b.animations.pause).not.toHaveBeenCalled();

    b.controller.apply({ animations: { autoplay: false } });
    expect(b.animations.pause).toHaveBeenCalled();
  });

  it('applies the playback speed', () => {
    const b = makeBundle();

    b.controller.apply({ animations: { speed: 2 } });

    expect(b.animations.setSpeed).toHaveBeenCalledWith(2);
    expect(b.repaint).toHaveBeenCalled();
  });
});

describe('RuntimeOptionsController path tracing', () => {
  it('enables path tracing at runtime and repaints once it is active', async () => {
    const b = makeBundle();

    b.controller.apply({ pathTracing: { enabled: true } });
    expect(b.repaint).toHaveBeenCalledTimes(1);
    await flushPromises();

    expect(b.pathTracing.enableRuntime).toHaveBeenCalled();
    expect(b.repaint).toHaveBeenCalledTimes(2);
  });

  it('skips the late repaint when the tracer stayed off or the viewer was disposed', async () => {
    const inactive = makeBundle({ enableRuntime: jest.fn(async () => false) });
    inactive.controller.apply({ pathTracing: { enabled: true } });

    const disposed = makeBundle();
    disposed.controller.apply({ pathTracing: { enabled: true } });
    disposed.state.disposed = true;

    await flushPromises();

    expect(inactive.repaint).toHaveBeenCalledTimes(1);
    expect(disposed.repaint).toHaveBeenCalledTimes(1);
  });

  it('reports a failed runtime enable as an error event', async () => {
    const b = makeBundle({ enableRuntime: jest.fn(async () => {
      throw new Error('no WebGL2');
    }) });
    const onError = jest.fn();
    b.events.on('error', onError);

    b.controller.apply({ pathTracing: { enabled: true } });
    await flushPromises();

    expect(onError.mock.calls[0][0].error.code).toBe(ErrorCode.PATH_TRACING_INIT_FAILED);
  });

  it('stays silent about a failed enable after dispose', async () => {
    const b = makeBundle({ enableRuntime: jest.fn(async () => {
      throw new Error('no WebGL2');
    }) });
    const onError = jest.fn();
    b.events.on('error', onError);

    b.controller.apply({ pathTracing: { enabled: true } });
    b.state.disposed = true;
    await flushPromises();

    expect(onError).not.toHaveBeenCalled();
  });

  it('disables path tracing and repaints right away', () => {
    const b = makeBundle({ options: { pathTracing: { enabled: true } } });

    b.controller.apply({ pathTracing: { enabled: false } });

    expect(b.pathTracing.disableRuntime).toHaveBeenCalled();
    expect(b.repaint).toHaveBeenCalledTimes(2);
  });

  it('ignores an unchanged enabled flag', () => {
    const b = makeBundle();

    b.controller.apply({ pathTracing: { enabled: false } });

    expect(b.pathTracing.disableRuntime).not.toHaveBeenCalled();
    expect(b.repaint).not.toHaveBeenCalled();
  });
});

describe('RuntimeOptionsController variants', () => {
  it('selects a changed variant and clears it with undefined', () => {
    const b = makeBundle({ options: { variant: 'beach' } });

    b.controller.apply({ variant: 'midnight' });
    b.controller.apply({ variant: undefined });

    expect(b.variants.selectOrWarn).toHaveBeenNthCalledWith(1, 'midnight');
    expect(b.variants.selectOrWarn).toHaveBeenNthCalledWith(2, null);
    expect(b.repaint).not.toHaveBeenCalled();
  });

  it('ignores an unchanged or absent variant', () => {
    const b = makeBundle({ options: { variant: 'beach' } });

    b.controller.apply({ variant: 'beach' });
    b.controller.apply({ renderer: { toneMappingExposure: 1 } });

    expect(b.variants.selectOrWarn).not.toHaveBeenCalled();
  });
});
