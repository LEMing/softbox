import { EnvironmentController, EnvironmentControllerDependencies } from '../EnvironmentController';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { Result } from '../../utils/Result';
import { deepMerge } from '../../utils/deepMerge';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { IScene, ITexture } from '../interfaces/IScene';
import { RenderLoopManager } from '../utils/RenderLoopManager';
import { PathTracingCoordinator } from '../PathTracingCoordinator';

const failure = (message: string) =>
  Result.err(new ThreeViewerError(message, ErrorCode.OPERATION_FAILED));

const makeBundle = (config: {
  options?: SimpleViewerOptions;
  withEnvironmentService?: boolean;
  withSceneSetupService?: boolean;
  environmentOverrides?: Record<string, jest.Mock>;
  sceneSetupOverrides?: Record<string, jest.Mock>;
  disposed?: () => boolean;
} = {}) => {
  let options: SimpleViewerOptions = config.options ?? {};
  const scene = { id: 'scene' } as unknown as IScene;
  const renderLoopManager = { requestRender: jest.fn() } as unknown as RenderLoopManager;
  const pathTracing = { resetAccumulation: jest.fn() } as unknown as PathTracingCoordinator;
  const texture = { id: 'texture' } as unknown as ITexture;
  const environmentService =
    config.withEnvironmentService === false
      ? undefined
      : {
          loadEnvironmentMap: jest.fn(async () => Result.ok(texture)),
          applyToScene: jest.fn(() => Result.ok(undefined)),
          createStudioEnvironment: jest.fn(() => Result.ok(texture)),
          setBackgroundImage: jest.fn(async () => Result.ok(undefined)),
          ...config.environmentOverrides,
        };
  const sceneSetupService =
    config.withSceneSetupService === false
      ? undefined
      : {
          createGradientBackground: jest.fn(() => Result.ok(undefined)),
          ...config.sceneSetupOverrides,
        };
  const reviveRenderLoop = jest.fn();
  // Real deepMerge, matching ViewerCore's production closure exactly — a
  // shallow spread would REPLACE nested objects (e.g. environment) and mask
  // sibling-preservation bugs.
  const mergeOptions = jest.fn((partial: Partial<SimpleViewerOptions>) => {
    options = deepMerge(options, partial);
  });

  const controller = new EnvironmentController({
    scene,
    renderLoopManager,
    pathTracing,
    environmentService,
    sceneSetupService,
    getOptions: () => options,
    mergeOptions,
    isDisposed: config.disposed ?? (() => false),
    reviveRenderLoop,
  } as unknown as EnvironmentControllerDependencies);

  return {
    controller,
    scene,
    renderLoopManager,
    pathTracing,
    environmentService,
    sceneSetupService,
    reviveRenderLoop,
    mergeOptions,
    texture,
    getOptions: () => options,
  };
};

describe('EnvironmentController.applyBackgroundColor', () => {
  it('paints a flat fill and requests a repaint', () => {
    const b = makeBundle({ options: { backgroundColor: '#111111' } });
    b.controller.applyBackgroundColor('#111111');
    expect(b.sceneSetupService!.createGradientBackground).toHaveBeenCalledWith(b.scene, {
      topColor: '#111111',
      bottomColor: '#111111',
    });
    expect((b.renderLoopManager as unknown as { requestRender: jest.Mock }).requestRender).toHaveBeenCalled();
  });

  it('paints a radial vignette when an edge colour is stored', () => {
    const b = makeBundle({
      options: { backgroundColor: '#242430', backgroundColorEdge: '#050507' },
    });
    b.controller.applyBackgroundColor('#242430');
    expect(b.sceneSetupService!.createGradientBackground).toHaveBeenCalledWith(b.scene, {
      topColor: '#242430',
      bottomColor: '#050507',
      radial: true,
    });
  });

  it('does not override an environment-map backdrop', () => {
    const b = makeBundle({ options: { environment: { url: 'env.hdr' } } });
    b.controller.applyBackgroundColor('#111111');
    expect(b.sceneSetupService!.createGradientBackground).not.toHaveBeenCalled();
  });

  it('warns and skips the repaint when the paint fails', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const b = makeBundle({
      sceneSetupOverrides: { createGradientBackground: jest.fn(() => failure('paint')) },
    });
    b.controller.applyBackgroundColor('#111111');
    expect(warn).toHaveBeenCalled();
    expect((b.renderLoopManager as unknown as { requestRender: jest.Mock }).requestRender).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('EnvironmentController.setEnvironmentMap', () => {
  it('loads, applies, stores the url and forces a path-tracing re-ingest', async () => {
    const b = makeBundle({ options: { environment: { environmentIntensity: 0.5 } } });
    const result = await b.controller.setEnvironmentMap('/studio.hdr');
    expect(result.ok).toBe(true);
    expect(b.environmentService!.applyToScene).toHaveBeenCalledWith(
      b.scene,
      b.texture,
      expect.objectContaining({ setBackground: true, environmentIntensity: 0.5 })
    );
    expect(b.mergeOptions).toHaveBeenCalledWith({ environment: { url: '/studio.hdr' } });
    expect((b.pathTracing as unknown as { resetAccumulation: jest.Mock }).resetAccumulation).toHaveBeenCalledWith(true);
    expect(b.reviveRenderLoop).toHaveBeenCalled();
  });

  it('reports INVALID_STATE on a disposed viewer without touching the service', async () => {
    const b = makeBundle({ disposed: () => true });
    const result = await b.controller.setEnvironmentMap('/studio.hdr');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
    expect(b.environmentService!.loadEnvironmentMap).not.toHaveBeenCalled();
  });

  it('errors without an environment service', async () => {
    const b = makeBundle({ withEnvironmentService: false });
    const result = await b.controller.setEnvironmentMap('/studio.hdr');
    expect(result.ok).toBe(false);
  });

  it('surfaces a load failure', async () => {
    const b = makeBundle({
      environmentOverrides: { loadEnvironmentMap: jest.fn(async () => failure('404')) },
    });
    const result = await b.controller.setEnvironmentMap('/missing.hdr');
    expect(result.ok).toBe(false);
  });

  it('bails quietly when disposed while the map was loading', async () => {
    let disposed = false;
    const b = makeBundle({
      disposed: () => disposed,
      environmentOverrides: {
        loadEnvironmentMap: jest.fn(async () => {
          disposed = true;
          return Result.ok({ id: 't' } as unknown as ITexture);
        }),
      },
    });
    const result = await b.controller.setEnvironmentMap('/studio.hdr');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
    expect(b.environmentService!.applyToScene).not.toHaveBeenCalled();
  });

  it('surfaces an apply failure without storing the url', async () => {
    const b = makeBundle({
      environmentOverrides: { applyToScene: jest.fn(() => failure('apply')) },
    });
    const result = await b.controller.setEnvironmentMap('/studio.hdr');
    expect(result.ok).toBe(false);
    expect(b.mergeOptions).not.toHaveBeenCalled();
  });
});

describe('EnvironmentController.resetEnvironment', () => {
  it('propagates a failed studio re-apply instead of claiming success', () => {
    const b = makeBundle({
      environmentOverrides: {
        applyToScene: jest.fn(() =>
          Result.err(new ThreeViewerError('apply failed', ErrorCode.SCENE_OPERATION_FAILED))
        ),
      },
    });
    const result = b.controller.resetEnvironment();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.SCENE_OPERATION_FAILED);
  });

  it('warns but completes when the background restore paint fails', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const b = makeBundle({
      options: { backgroundColor: '#111111' },
      sceneSetupOverrides: {
        createGradientBackground: jest.fn(() =>
          Result.err(new ThreeViewerError('paint failed', ErrorCode.SCENE_OPERATION_FAILED))
        ),
      },
    });
    const result = b.controller.resetEnvironment();
    expect(result.ok).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      'Failed to restore the background color:',
      expect.anything()
    );
    warn.mockRestore();
  });

  it('restores the studio env, clears the url and repaints the stored backdrop', () => {
    const b = makeBundle({
      options: {
        backgroundColor: '#242430',
        backgroundColorEdge: '#050507',
        environment: { url: '/old.hdr' },
      },
    });
    const result = b.controller.resetEnvironment();
    expect(result.ok).toBe(true);
    expect(b.environmentService!.applyToScene).toHaveBeenCalledWith(
      b.scene,
      b.texture,
      expect.objectContaining({ setBackground: false })
    );
    expect(b.getOptions().environment?.url).toBeUndefined();
    // The stored radial vignette survives the reset.
    expect(b.sceneSetupService!.createGradientBackground).toHaveBeenCalledWith(b.scene, {
      topColor: '#242430',
      bottomColor: '#050507',
      radial: true,
    });
  });

  it('skips the backdrop repaint when no background colour is stored', () => {
    const b = makeBundle({ options: {} });
    const result = b.controller.resetEnvironment();
    expect(result.ok).toBe(true);
    expect(b.sceneSetupService!.createGradientBackground).not.toHaveBeenCalled();
  });

  it('reports INVALID_STATE on a disposed viewer without touching the service', () => {
    const b = makeBundle({ disposed: () => true });
    const result = b.controller.resetEnvironment();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
    expect(b.environmentService!.createStudioEnvironment).not.toHaveBeenCalled();
  });

  it('errors without an environment service', () => {
    const b = makeBundle({ withEnvironmentService: false });
    expect(b.controller.resetEnvironment().ok).toBe(false);
  });

  it('surfaces a studio-environment failure', () => {
    const b = makeBundle({
      environmentOverrides: { createStudioEnvironment: jest.fn(() => failure('studio')) },
    });
    expect(b.controller.resetEnvironment().ok).toBe(false);
  });
});

describe('EnvironmentController.setBackgroundImage', () => {
  it('delegates to the environment service and repaints', async () => {
    const b = makeBundle();
    const result = await b.controller.setBackgroundImage('/photo.jpg');
    expect(result.ok).toBe(true);
    expect(b.environmentService!.setBackgroundImage).toHaveBeenCalledWith(b.scene, '/photo.jpg');
    expect((b.pathTracing as unknown as { resetAccumulation: jest.Mock }).resetAccumulation).toHaveBeenCalledWith(true);
  });

  it('reports INVALID_STATE on a disposed viewer without touching the service', async () => {
    const b = makeBundle({ disposed: () => true });
    const result = await b.controller.setBackgroundImage('/p.jpg');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
    expect(b.environmentService!.setBackgroundImage).not.toHaveBeenCalled();
  });

  it('errors without an environment service', async () => {
    const b = makeBundle({ withEnvironmentService: false });
    expect((await b.controller.setBackgroundImage('/p.jpg')).ok).toBe(false);
  });

  it('surfaces a service failure', async () => {
    const b = makeBundle({
      environmentOverrides: { setBackgroundImage: jest.fn(async () => failure('bad image')) },
    });
    expect((await b.controller.setBackgroundImage('/bad.png')).ok).toBe(false);
  });

  it('bails quietly when disposed while the image was decoding', async () => {
    let disposed = false;
    const b = makeBundle({
      disposed: () => disposed,
      environmentOverrides: {
        setBackgroundImage: jest.fn(async () => {
          disposed = true;
          return Result.ok(undefined);
        }),
      },
    });
    const result = await b.controller.setBackgroundImage('/photo.jpg');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
    expect((b.pathTracing as unknown as { resetAccumulation: jest.Mock }).resetAccumulation).not.toHaveBeenCalled();
  });
});

describe('EnvironmentController.setBackgroundColor', () => {
  it('paints a flat override, stores it and clears any radial edge', () => {
    const b = makeBundle({
      options: { backgroundColor: '#242430', backgroundColorEdge: '#050507' },
    });
    const result = b.controller.setBackgroundColor('#abcdef');
    expect(result.ok).toBe(true);
    expect(b.sceneSetupService!.createGradientBackground).toHaveBeenCalledWith(b.scene, {
      topColor: '#abcdef',
      bottomColor: '#abcdef',
    });
    expect(b.mergeOptions).toHaveBeenCalledWith({ backgroundColor: '#abcdef' });
    expect(b.getOptions().backgroundColorEdge).toBeUndefined();
  });

  it('reports INVALID_STATE on a disposed viewer without touching the service', () => {
    const b = makeBundle({ disposed: () => true });
    const result = b.controller.setBackgroundColor('#fff');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
    expect(b.sceneSetupService!.createGradientBackground).not.toHaveBeenCalled();
  });

  it('errors without a scene setup service', () => {
    const b = makeBundle({ withSceneSetupService: false });
    expect(b.controller.setBackgroundColor('#fff').ok).toBe(false);
  });

  it('surfaces a paint failure without storing the colour', () => {
    const b = makeBundle({
      sceneSetupOverrides: { createGradientBackground: jest.fn(() => failure('paint')) },
    });
    expect(b.controller.setBackgroundColor('#fff').ok).toBe(false);
    expect(b.mergeOptions).not.toHaveBeenCalled();
  });
});
