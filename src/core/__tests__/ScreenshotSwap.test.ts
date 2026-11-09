import * as THREE from 'three';
import { ScreenshotSwap, ScreenshotSwapDependencies } from '../ScreenshotSwap';
import { SerializedSceneState } from '../utils/SceneSerializer';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';

const serializedState: SerializedSceneState = {
  modelUrl: 'chair.glb',
  cameraPosition: { x: 1, y: 2, z: 3 },
  cameraTarget: { x: 0, y: 0, z: 0 },
  controlsTarget: { x: 0, y: 1, z: 0 },
  rendererSize: { width: 800, height: 600 },
};

const makeBundle = (config: {
  serialized?: SerializedSceneState;
  reloadResult?: Result<void>;
} = {}) => {
  const camera = new THREE.PerspectiveCamera();
  const controls = { target: new THREE.Vector3(), update: jest.fn() };
  const screenshotManager = {
    captureAndReplace: jest.fn(),
    getSerializedState: jest.fn(() => config.serialized),
  };
  const modelManager = {
    getLastModelUrl: jest.fn(() => 'chair.glb'),
    disposeCurrentModel: jest.fn(),
  };
  const resourceManager = { disposeSceneResources: jest.fn() };
  const frameLoop = { resume: jest.fn() };
  const reloadModel = jest.fn(async () => config.reloadResult ?? Result.ok(undefined));

  const swap = new ScreenshotSwap({
    camera,
    controls,
    screenshotManager,
    modelManager,
    resourceManager,
    frameLoop,
    reloadModel,
  } as unknown as ScreenshotSwapDependencies);

  return { swap, camera, controls, screenshotManager, modelManager, resourceManager, frameLoop, reloadModel };
};

describe('ScreenshotSwap.replaceScene', () => {
  it('captures the scene with the last model url and frees the scene once replaced', () => {
    const b = makeBundle();

    b.swap.replaceScene();

    expect(b.screenshotManager.captureAndReplace).toHaveBeenCalledWith(
      b.camera,
      b.controls,
      'chair.glb',
      expect.any(Function)
    );
    expect(b.modelManager.disposeCurrentModel).not.toHaveBeenCalled();

    const onResourcesDisposed = b.screenshotManager.captureAndReplace.mock.calls[0][3] as () => void;
    onResourcesDisposed();

    expect(b.modelManager.disposeCurrentModel).toHaveBeenCalled();
    expect(b.resourceManager.disposeSceneResources).toHaveBeenCalledWith(true);
  });
});

describe('ScreenshotSwap.restoreScene', () => {
  it('restores the camera, reloads the model and resumes the loop', async () => {
    const b = makeBundle({ serialized: serializedState });

    await b.swap.restoreScene();

    expect(b.camera.position.toArray()).toEqual([1, 2, 3]);
    expect(b.controls.target.toArray()).toEqual([0, 1, 0]);
    expect(b.reloadModel).toHaveBeenCalledWith('chair.glb');
    expect(b.frameLoop.resume).toHaveBeenCalled();
  });

  it('logs a failed reload and still resumes the loop', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new ThreeViewerError('404', ErrorCode.MODEL_LOAD_FAILED);
    const b = makeBundle({ serialized: serializedState, reloadResult: Result.err(error) });

    await b.swap.restoreScene();

    expect(consoleError).toHaveBeenCalledWith('[ViewerCore] Failed to reload model:', error);
    expect(b.frameLoop.resume).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('just resumes the loop when nothing was serialized', async () => {
    const b = makeBundle();

    await b.swap.restoreScene();

    expect(b.reloadModel).not.toHaveBeenCalled();
    expect(b.frameLoop.resume).toHaveBeenCalled();
  });
});
