import * as THREE from 'three';
import { MaterialVariantController, MaterialVariantControllerDependencies } from '../MaterialVariantController';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';

const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 3; i += 1) {
    await Promise.resolve();
  }
};

const makeBundle = (config: {
  model?: THREE.Object3D | null;
  withSceneSetup?: boolean;
  applyResult?: Result<boolean>;
} = {}) => {
  const state = {
    model: config.model === undefined ? new THREE.Object3D() : config.model,
    disposed: false,
  };
  const modelManager = {
    getCurrentModel: jest.fn(() => state.model),
    getVariantNames: jest.fn(() => ['beach', 'midnight']),
  };
  const sceneSetupService = {
    applyMaterialVariant: jest.fn(async () => config.applyResult ?? Result.ok(true)),
  };
  const pathTracing = { resetAccumulation: jest.fn() };
  const repaint = jest.fn();
  const options: SimpleViewerOptions = {};

  const controller = new MaterialVariantController({
    modelManager,
    pathTracing,
    sceneSetupService: config.withSceneSetup === false ? undefined : sceneSetupService,
    getOptions: () => options,
    isDisposed: () => state.disposed,
    repaint,
  } as unknown as MaterialVariantControllerDependencies);

  return { controller, state, sceneSetupService, pathTracing, repaint, options };
};

describe('MaterialVariantController', () => {
  it('lists the model variants', () => {
    expect(makeBundle().controller.getNames()).toEqual(['beach', 'midnight']);
  });

  it('rejects a variant the loaded model does not have', () => {
    const b = makeBundle();

    const result = b.controller.select('desert');

    expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_PARAMETER);
    expect(b.options.variant).toBeUndefined();
  });

  it('remembers the variant without a model so the next load applies it', () => {
    const b = makeBundle({ model: null });

    expect(b.controller.select('desert').ok).toBe(true);

    expect(b.options.variant).toBe('desert');
    expect(b.sceneSetupService.applyMaterialVariant).not.toHaveBeenCalled();
  });

  it('remembers the variant when the viewer has no scene setup service', () => {
    const b = makeBundle({ withSceneSetup: false });

    expect(b.controller.select('beach').ok).toBe(true);

    expect(b.options.variant).toBe('beach');
  });

  it('applies the variant, restarts accumulation and repaints', async () => {
    const b = makeBundle();

    b.controller.select('beach');
    await flushPromises();

    expect(b.sceneSetupService.applyMaterialVariant).toHaveBeenCalledWith(b.state.model, 'beach');
    expect(b.pathTracing.resetAccumulation).toHaveBeenCalledWith(true);
    expect(b.repaint).toHaveBeenCalled();
  });

  it('clears the stored variant when restoring the default materials', async () => {
    const b = makeBundle();
    b.options.variant = 'beach';

    b.controller.select(null);
    await flushPromises();

    expect(b.options.variant).toBeUndefined();
    expect(b.sceneSetupService.applyMaterialVariant).toHaveBeenCalledWith(b.state.model, null);
  });

  it('does not repaint when nothing changed or the model went stale', async () => {
    const unchanged = makeBundle({ applyResult: Result.ok(false) });
    unchanged.controller.select('beach');

    const replaced = makeBundle();
    replaced.controller.select('beach');
    replaced.state.model = new THREE.Object3D();

    const disposed = makeBundle();
    disposed.controller.select('beach');
    disposed.state.disposed = true;

    await flushPromises();

    for (const b of [unchanged, replaced, disposed]) {
      expect(b.repaint).not.toHaveBeenCalled();
      expect(b.pathTracing.resetAccumulation).not.toHaveBeenCalled();
    }
  });

  it('warns when applying the variant fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = new ThreeViewerError('variant failed', ErrorCode.OPERATION_FAILED);
    const b = makeBundle({ applyResult: Result.err(error) });

    b.controller.select('beach');
    await flushPromises();

    expect(warn).toHaveBeenCalledWith('Failed to apply material variant:', error);
    expect(b.repaint).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns instead of failing when an unknown variant comes from options', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const b = makeBundle();

    b.controller.selectOrWarn('desert');

    expect(warn).toHaveBeenCalledWith('Failed to apply material variant:', expect.any(ThreeViewerError));
    warn.mockRestore();
  });

  it('stays quiet when the variant from options applies', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const b = makeBundle();

    b.controller.selectOrWarn('beach');

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
