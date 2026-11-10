import type * as THREE from 'three';
import { Result } from '../utils/Result';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/CoreViewerEvents';
import { ThreeViewerError, ErrorCode } from '../errors';
import { StateManager } from './managers/StateManager';
import { ModelManager } from './managers/ModelManager';

export interface ModelLoadQueueDependencies {
  modelManager: ModelManager;
  stateManager: StateManager;
  events: TypedEventEmitter<ViewerEventMap>;
  isDisposed: () => boolean;
  onLoaded: (model: THREE.Object3D) => void;
}

export class ModelLoadQueue {
  private readonly deps: ModelLoadQueueDependencies;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(deps: ModelLoadQueueDependencies) {
    this.deps = deps;
  }

  load(source: string | THREE.Object3D): Promise<Result<void>> {
    const run = this.chain.then(() => this.runLoad(source));
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  settled(): Promise<unknown> {
    return this.chain;
  }

  private async runLoad(source: string | THREE.Object3D): Promise<Result<void>> {
    const { stateManager, modelManager } = this.deps;
    if (this.deps.isDisposed()) {
      return Result.err(
        new ThreeViewerError('Cannot load model after dispose', ErrorCode.INVALID_STATE)
      );
    }
    if (!stateManager.canLoad()) {
      return Result.err(
        new ThreeViewerError(
          'Cannot load model in current state',
          ErrorCode.INVALID_STATE,
          {
            currentState: stateManager.getStatus(),
            isInitialized: stateManager.isInitialized()
          }
        )
      );
    }

    try {
      stateManager.startLoading();

      const result = await modelManager.loadModel(source, this.deps.events);

      if (this.deps.isDisposed()) {
        if (result.ok) {
          modelManager.disposeCurrentModel();
        }
        return Result.err(
          new ThreeViewerError('Viewer was disposed while the model was loading', ErrorCode.INVALID_STATE)
        );
      }

      if (!result.ok) {
        stateManager.setError(result.error);
        return result;
      }

      stateManager.setLoaded(result.value);
      this.deps.onLoaded(result.value);
      return Result.ok(undefined);
    } catch (error) {
      const viewerError = error instanceof ThreeViewerError ? error :
        new ThreeViewerError(
          'Failed to load model',
          ErrorCode.MODEL_LOAD_FAILED,
          { originalError: error, source }
        );

      stateManager.setError(viewerError);
      return Result.err(viewerError);
    }
  }
}
