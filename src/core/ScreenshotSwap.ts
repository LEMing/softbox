import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Result } from '../utils/Result';
import { SceneSerializer } from './utils/SceneSerializer';
import { ScreenshotManager } from './managers/ScreenshotManager';
import { ModelManager } from './managers/ModelManager';
import { ResourceManager } from './managers/ResourceManager';
import { FrameLoop } from './FrameLoop';

export interface ScreenshotSwapDependencies {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  screenshotManager: ScreenshotManager;
  modelManager: ModelManager;
  resourceManager: ResourceManager;
  frameLoop: FrameLoop;
  reloadModel: (url: string) => Promise<Result<void>>;
}

export class ScreenshotSwap {
  private readonly deps: ScreenshotSwapDependencies;

  constructor(deps: ScreenshotSwapDependencies) {
    this.deps = deps;
  }

  replaceScene(): void {
    const { screenshotManager, modelManager, resourceManager } = this.deps;
    screenshotManager.captureAndReplace(
      this.deps.camera,
      this.deps.controls,
      modelManager.getLastModelUrl(),
      () => {
        modelManager.disposeCurrentModel();
        resourceManager.disposeSceneResources(true);
      }
    );
  }

  async restoreScene(): Promise<void> {
    const serializedState = this.deps.screenshotManager.getSerializedState();

    if (serializedState) {
      await SceneSerializer.restore(
        serializedState,
        this.deps.camera,
        this.deps.controls,
        async (url) => {
          const result = await this.deps.reloadModel(url);
          if (!result.ok) {
            console.error('[ViewerCore] Failed to reload model:', result.error);
          }
        }
      );
    }

    this.deps.frameLoop.resume();
  }
}
