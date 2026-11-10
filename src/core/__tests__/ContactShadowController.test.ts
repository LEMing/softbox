import * as THREE from 'three';
import { ContactShadowController, ContactShadowControllerDependencies } from '../ContactShadowController';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';

const makeBundle = (config: {
  withSceneSetup?: boolean;
  model?: THREE.Object3D | null;
  animating?: boolean;
  disposed?: boolean;
  bakeResult?: Result<void>;
} = {}) => {
  const scene = new THREE.Scene();
  const webGLRenderer = {};
  const renderer = { getWebGLRenderer: jest.fn(() => webGLRenderer) };
  const sceneSetupService = {
    setContactShadowMode: jest.fn(() => Result.ok(undefined)),
    bakeContactShadow: jest.fn(() => config.bakeResult ?? Result.ok(undefined)),
  };
  const state = {
    model: config.model === undefined ? new THREE.Object3D() : config.model,
    animating: config.animating ?? false,
    disposed: config.disposed ?? false,
  };
  const deferred: Array<() => void> = [];
  const repaint = jest.fn();

  const controller = new ContactShadowController({
    scene,
    renderer,
    sceneSetupService: config.withSceneSetup === false ? undefined : sceneSetupService,
    getCurrentModel: () => state.model,
    isAnimating: () => state.animating,
    isDisposed: () => state.disposed,
    deferToNextFrame: (callback: () => void) => deferred.push(callback),
    repaint,
  } as unknown as ContactShadowControllerDependencies);

  const flush = () => deferred.splice(0).forEach((callback) => callback());

  return { controller, scene, webGLRenderer, sceneSetupService, state, repaint, flush };
};

describe('ContactShadowController', () => {
  it('switches the contact shadow to live mode while the pose moves', () => {
    const b = makeBundle();

    b.controller.followLivePose();

    expect(b.sceneSetupService.setContactShadowMode).toHaveBeenCalledWith(b.scene, 'live');
  });

  it('bakes the current model with the WebGL renderer', () => {
    const b = makeBundle();

    b.controller.rebakeForCurrentPose();

    expect(b.sceneSetupService.bakeContactShadow).toHaveBeenCalledWith(
      b.scene,
      b.state.model,
      b.webGLRenderer
    );
  });

  it('skips the bake without a model or a scene setup service', () => {
    const withoutModel = makeBundle({ model: null });
    withoutModel.controller.rebakeForCurrentPose();
    expect(withoutModel.sceneSetupService.bakeContactShadow).not.toHaveBeenCalled();

    const withoutService = makeBundle({ withSceneSetup: false });
    expect(() => withoutService.controller.rebakeForCurrentPose()).not.toThrow();
    expect(() => withoutService.controller.followLivePose()).not.toThrow();
  });

  it('warns when the bake fails', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = new ThreeViewerError('bake failed', ErrorCode.OPERATION_FAILED);
    const b = makeBundle({ bakeResult: Result.err(error) });

    b.controller.rebakeForCurrentPose();

    expect(warn).toHaveBeenCalledWith('Failed to bake contact shadow:', error);
    warn.mockRestore();
  });

  it('bakes the freshly loaded model on a later frame and repaints', () => {
    const b = makeBundle();

    b.controller.scheduleBakeFor(b.state.model!);
    expect(b.sceneSetupService.bakeContactShadow).not.toHaveBeenCalled();
    b.flush();

    expect(b.sceneSetupService.bakeContactShadow).toHaveBeenCalledTimes(1);
    expect(b.repaint).toHaveBeenCalledTimes(1);
  });

  it('drops the deferred bake once the model was replaced, the viewer disposed or animation started', () => {
    const replaced = makeBundle();
    replaced.controller.scheduleBakeFor(replaced.state.model!);
    replaced.state.model = new THREE.Object3D();
    replaced.flush();

    const disposed = makeBundle();
    disposed.controller.scheduleBakeFor(disposed.state.model!);
    disposed.state.disposed = true;
    disposed.flush();

    const animating = makeBundle();
    animating.controller.scheduleBakeFor(animating.state.model!);
    animating.state.animating = true;
    animating.flush();

    for (const b of [replaced, disposed, animating]) {
      expect(b.sceneSetupService.bakeContactShadow).not.toHaveBeenCalled();
      expect(b.repaint).not.toHaveBeenCalled();
    }
  });

  it('finishes a scheduled bake at once and leaves nothing for the later frame', () => {
    const b = makeBundle();
    b.controller.scheduleBakeFor(b.state.model!);

    b.controller.finishScheduledBake();

    expect(b.sceneSetupService.bakeContactShadow).toHaveBeenCalledTimes(1);
    b.flush();
    expect(b.sceneSetupService.bakeContactShadow).toHaveBeenCalledTimes(1);
    expect(b.repaint).not.toHaveBeenCalled();
  });

  it('has nothing to finish when no bake is scheduled', () => {
    const b = makeBundle();

    b.controller.finishScheduledBake();

    expect(b.sceneSetupService.bakeContactShadow).not.toHaveBeenCalled();
  });

  it('keeps a scheduled bake for the later frame while the model animates', () => {
    const b = makeBundle({ animating: true });
    b.controller.scheduleBakeFor(b.state.model!);

    b.controller.finishScheduledBake();
    expect(b.sceneSetupService.bakeContactShadow).not.toHaveBeenCalled();

    b.state.animating = false;
    b.flush();
    expect(b.sceneSetupService.bakeContactShadow).toHaveBeenCalledTimes(1);
    expect(b.repaint).toHaveBeenCalledTimes(1);
  });

  it('does not finish a bake scheduled for a model that was replaced', () => {
    const b = makeBundle();
    b.controller.scheduleBakeFor(b.state.model!);
    b.state.model = new THREE.Object3D();

    b.controller.finishScheduledBake();

    expect(b.sceneSetupService.bakeContactShadow).not.toHaveBeenCalled();
  });
});
