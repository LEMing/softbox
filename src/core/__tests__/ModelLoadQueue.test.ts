import * as THREE from 'three';
import { ModelLoadQueue, ModelLoadQueueDependencies } from '../ModelLoadQueue';
import { StateManager } from '../managers/StateManager';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { ViewerEventMap } from '../events/CoreViewerEvents';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const makeBundle = (loadModel: jest.Mock = jest.fn(async () => Result.ok(new THREE.Object3D()))) => {
  const stateManager = new StateManager();
  stateManager.setInitialized();
  const modelManager = { loadModel, disposeCurrentModel: jest.fn() };
  const events = new TypedEventEmitter<ViewerEventMap>();
  const state = { disposed: false };
  const onLoaded = jest.fn();

  const queue = new ModelLoadQueue({
    modelManager,
    stateManager,
    events,
    isDisposed: () => state.disposed,
    onLoaded,
  } as unknown as ModelLoadQueueDependencies);

  return { queue, stateManager, modelManager, events, state, onLoaded };
};

describe('ModelLoadQueue', () => {
  it('loads through the model manager, marks the state loaded and hands the model on', async () => {
    const model = new THREE.Object3D();
    const b = makeBundle(jest.fn(async () => Result.ok(model)));

    const result = await b.queue.load('a.glb');

    expect(result.ok).toBe(true);
    expect(b.modelManager.loadModel).toHaveBeenCalledWith('a.glb', b.events);
    expect(b.stateManager.getStatus()).toBe('loaded');
    expect(b.onLoaded).toHaveBeenCalledWith(model);
  });

  it('runs loads one after another in call order', async () => {
    const first = deferred<Result<THREE.Object3D>>();
    const second = deferred<Result<THREE.Object3D>>();
    const loadModel = jest.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const b = makeBundle(loadModel);

    const firstRun = b.queue.load('first.glb');
    const secondRun = b.queue.load('second.glb');
    await Promise.resolve();
    await Promise.resolve();
    expect(loadModel).toHaveBeenCalledTimes(1);

    first.resolve(Result.ok(new THREE.Object3D()));
    await firstRun;
    second.resolve(Result.ok(new THREE.Object3D()));
    await secondRun;

    expect(loadModel.mock.calls.map(([source]) => source)).toEqual(['first.glb', 'second.glb']);
  });

  it('settles after the queued loads, even a failed one', async () => {
    const b = makeBundle(jest.fn(async () => {
      throw new Error('network');
    }));

    const run = b.queue.load('broken.glb');
    await expect(b.queue.settled()).resolves.toBeUndefined();

    expect((await run).ok).toBe(false);
  });

  it('refuses to load after dispose', async () => {
    const b = makeBundle();
    b.state.disposed = true;

    const result = await b.queue.load('a.glb');

    expect(!result.ok && result.error.message).toBe('Cannot load model after dispose');
    expect(b.modelManager.loadModel).not.toHaveBeenCalled();
  });

  it('refuses to load before the viewer is initialized', async () => {
    const b = makeBundle();
    const fresh = new StateManager();
    const queue = new ModelLoadQueue({
      modelManager: b.modelManager,
      stateManager: fresh,
      events: b.events,
      isDisposed: () => false,
      onLoaded: b.onLoaded,
    } as unknown as ModelLoadQueueDependencies);

    const result = await queue.load('a.glb');

    expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_STATE);
    expect(!result.ok && result.error.context).toEqual({
      currentState: fresh.getStatus(),
      isInitialized: false,
    });
  });

  it('disposes a model that finished loading after the viewer was disposed', async () => {
    const pending = deferred<Result<THREE.Object3D>>();
    const b = makeBundle(jest.fn(() => pending.promise));

    const run = b.queue.load('a.glb');
    await Promise.resolve();
    b.state.disposed = true;
    pending.resolve(Result.ok(new THREE.Object3D()));
    const result = await run;

    expect(!result.ok && result.error.message).toBe('Viewer was disposed while the model was loading');
    expect(b.modelManager.disposeCurrentModel).toHaveBeenCalled();
    expect(b.onLoaded).not.toHaveBeenCalled();
  });

  it('leaves nothing to dispose when a load failed during dispose', async () => {
    const pending = deferred<Result<THREE.Object3D>>();
    const b = makeBundle(jest.fn(() => pending.promise));

    const run = b.queue.load('a.glb');
    await Promise.resolve();
    b.state.disposed = true;
    pending.resolve(Result.err(new ThreeViewerError('404', ErrorCode.MODEL_LOAD_FAILED)));
    await run;

    expect(b.modelManager.disposeCurrentModel).not.toHaveBeenCalled();
  });

  it('records a failed load in the state', async () => {
    const error = new ThreeViewerError('404', ErrorCode.MODEL_LOAD_FAILED);
    const b = makeBundle(jest.fn(async () => Result.err(error)));

    const result = await b.queue.load('missing.glb');

    expect(!result.ok && result.error).toBe(error);
    expect(b.stateManager.getStatus()).toBe('error');
    expect(b.onLoaded).not.toHaveBeenCalled();
  });

  it('wraps a thrown error and keeps a thrown viewer error as is', async () => {
    const viewerError = new ThreeViewerError('bad', ErrorCode.INVALID_PARAMETER);
    const wrapped = makeBundle(jest.fn(async () => {
      throw new Error('boom');
    }));
    const passedThrough = makeBundle(jest.fn(async () => {
      throw viewerError;
    }));

    const wrappedResult = await wrapped.queue.load('a.glb');
    const passedResult = await passedThrough.queue.load('b.glb');

    expect(!wrappedResult.ok && wrappedResult.error.code).toBe(ErrorCode.MODEL_LOAD_FAILED);
    expect(!wrappedResult.ok && wrappedResult.error.context).toMatchObject({ source: 'a.glb' });
    expect(!passedResult.ok && passedResult.error).toBe(viewerError);
  });
});
