import * as THREE from 'three';
import { AnimationController, AnimationControllerDependencies } from '../AnimationController';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';

const makeAnimationService = (overrides: Record<string, jest.Mock> = {}) => ({
  attach: jest.fn(),
  detach: jest.fn(),
  play: jest.fn(() => Result.ok(undefined)),
  pause: jest.fn(),
  isPlaying: jest.fn(() => true),
  setSpeed: jest.fn(),
  getClipNames: jest.fn(() => ['Walk', 'Run']),
  update: jest.fn(),
  ...overrides,
});

const makeBundle = (config: {
  withService?: boolean;
  options?: SimpleViewerOptions;
  serviceOverrides?: Record<string, jest.Mock>;
} = {}) => {
  const animationService = makeAnimationService(config.serviceOverrides);
  const renderLoopManager = {
    requireContinuous: jest.fn(),
    releaseContinuous: jest.fn(),
    requestRender: jest.fn(),
  };
  const pathTracing = { resetAccumulation: jest.fn() };
  const contactShadows = { followLivePose: jest.fn(), rebakeForCurrentPose: jest.fn() };
  const repaint = jest.fn();
  const options: SimpleViewerOptions = config.options ?? {};

  const controller = new AnimationController({
    animationService: config.withService === false ? undefined : animationService,
    renderLoopManager,
    pathTracing,
    contactShadows,
    getOptions: () => options,
    repaint,
  } as unknown as AnimationControllerDependencies);

  return { controller, animationService, renderLoopManager, pathTracing, contactShadows, repaint };
};

describe('AnimationController without an animation service', () => {
  it('reports no clips, never plays and tolerates every call', () => {
    const b = makeBundle({ withService: false });

    expect(b.controller.getClipNames()).toEqual([]);
    expect(b.controller.isPlaying()).toBe(false);
    expect(b.controller.play().ok).toBe(true);
    expect(() => {
      b.controller.setSpeed(2);
      b.controller.attachTo(new THREE.Object3D());
      b.controller.detach();
    }).not.toThrow();
    expect(b.renderLoopManager.releaseContinuous).not.toHaveBeenCalled();
  });

  it('refuses a named clip', () => {
    const b = makeBundle({ withService: false });

    const result = b.controller.play('Walk');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_STATE);
  });
});

describe('AnimationController.play', () => {
  it('holds the loop continuous, follows the live pose and repaints', () => {
    const b = makeBundle();

    expect(b.controller.play('Walk').ok).toBe(true);

    expect(b.animationService.play).toHaveBeenCalledWith('Walk');
    expect(b.contactShadows.followLivePose).toHaveBeenCalled();
    expect(b.renderLoopManager.requireContinuous).toHaveBeenCalledWith('animations');
    expect(b.repaint).toHaveBeenCalled();
  });

  it('passes a playback failure through untouched', () => {
    const failure = Result.err(new ThreeViewerError('no clip', ErrorCode.INVALID_PARAMETER));
    const b = makeBundle({ serviceOverrides: { play: jest.fn(() => failure) } });

    expect(b.controller.play('Nope')).toBe(failure);
    expect(b.renderLoopManager.requireContinuous).not.toHaveBeenCalled();
  });

  it('leaves the loop alone when the model has nothing to play', () => {
    const b = makeBundle({ serviceOverrides: { isPlaying: jest.fn(() => false) } });

    expect(b.controller.play().ok).toBe(true);

    expect(b.contactShadows.followLivePose).not.toHaveBeenCalled();
    expect(b.repaint).not.toHaveBeenCalled();
  });
});

describe('AnimationController.pause', () => {
  it('releases the loop, rebakes the shadow for the frozen pose and restarts accumulation', () => {
    const b = makeBundle();

    b.controller.pause();

    expect(b.animationService.pause).toHaveBeenCalled();
    expect(b.renderLoopManager.releaseContinuous).toHaveBeenCalledWith('animations');
    expect(b.contactShadows.rebakeForCurrentPose).toHaveBeenCalled();
    expect(b.pathTracing.resetAccumulation).toHaveBeenCalledWith(true);
    expect(b.renderLoopManager.requestRender).toHaveBeenCalled();
  });
});

describe('AnimationController.autoplay', () => {
  it('plays the named clip or the default one', () => {
    const b = makeBundle();

    b.controller.autoplay('Run');
    b.controller.autoplay(true);

    expect(b.animationService.play).toHaveBeenNthCalledWith(1, 'Run');
    expect(b.animationService.play).toHaveBeenNthCalledWith(2, undefined);
  });

  it('logs a failed autoplay instead of throwing', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = Result.err(new ThreeViewerError('no clip', ErrorCode.INVALID_PARAMETER));
    const b = makeBundle({ serviceOverrides: { play: jest.fn(() => failure) } });

    b.controller.autoplay('Nope');

    expect(error).toHaveBeenCalledWith('animations.autoplay failed:', 'no clip');
    error.mockRestore();
  });
});

describe('AnimationController.attachTo', () => {
  it('attaches the model, applies the configured speed and autoplays', () => {
    const b = makeBundle({ options: { animations: { speed: 0.5, autoplay: 'Walk' } } });
    const model = new THREE.Object3D();

    b.controller.attachTo(model);

    expect(b.renderLoopManager.releaseContinuous).toHaveBeenCalledWith('animations');
    expect(b.animationService.attach).toHaveBeenCalledWith(model);
    expect(b.animationService.setSpeed).toHaveBeenCalledWith(0.5);
    expect(b.animationService.play).toHaveBeenCalledWith('Walk');
  });

  it('only attaches when no speed or autoplay is configured', () => {
    const b = makeBundle();

    b.controller.attachTo(new THREE.Object3D());

    expect(b.animationService.setSpeed).not.toHaveBeenCalled();
    expect(b.animationService.play).not.toHaveBeenCalled();
  });
});

describe('AnimationController queries', () => {
  it('forwards clip names, playing state, speed and detach to the service', () => {
    const b = makeBundle();

    expect(b.controller.getClipNames()).toEqual(['Walk', 'Run']);
    expect(b.controller.isPlaying()).toBe(true);
    b.controller.setSpeed(3);
    b.controller.detach();

    expect(b.animationService.setSpeed).toHaveBeenCalledWith(3);
    expect(b.animationService.detach).toHaveBeenCalled();
  });
});
