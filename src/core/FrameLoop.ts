import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { ViewerRenderer } from './rendering/ViewerRenderer';
import { Result } from '../utils/Result';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/CoreViewerEvents';
import { IAnimationService } from './services/IAnimationService';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { StateManager } from './managers/StateManager';
import { PathTracingCoordinator } from './PathTracingCoordinator';

export interface FrameLoopDependencies {
  renderLoopManager: RenderLoopManager;
  renderer: ViewerRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  events: TypedEventEmitter<ViewerEventMap>;
  stateManager: StateManager;
  pathTracing: PathTracingCoordinator;
  animationService?: IAnimationService;
  isScreenshotActive: () => boolean;
  isDisposed: () => boolean;
}

export class FrameLoop {
  private readonly deps: FrameLoopDependencies;
  private frameCount = 0;
  private controlsChangeUnsubscribe: (() => void) | null = null;

  constructor(deps: FrameLoopDependencies) {
    this.deps = deps;
  }

  start(): void {
    this.deps.renderLoopManager.start((deltaTime) => this.tick(deltaTime));
  }

  isRunning(): boolean {
    return this.deps.renderLoopManager.isRunning();
  }

  revive(): void {
    if (this.deps.stateManager.isInitialized() && !this.isRunning()) {
      this.start();
    }
  }

  repaint(): void {
    this.revive();
    this.deps.renderLoopManager.requestRender();
  }

  resume(): void {
    if (!this.isRunning()) {
      this.start();
    }
    this.deps.renderLoopManager.requestRender();
  }

  wakeOnControlsChange(): void {
    const { controls } = this.deps;
    const handleControlsChange = () => {
      if (this.deps.isDisposed()) {
        return;
      }
      this.repaint();
    };
    controls.addEventListener('change', handleControlsChange);
    this.controlsChangeUnsubscribe = () =>
      controls.removeEventListener('change', handleControlsChange);
  }

  renderRaster(): Result<void> {
    return this.deps.renderer.renderPostProcessed(this.deps.scene, this.deps.camera);
  }

  dispose(): void {
    this.deps.renderLoopManager.stop();
    this.controlsChangeUnsubscribe?.();
    this.controlsChangeUnsubscribe = null;
  }

  private tick(deltaTime: number): void {
    const { renderLoopManager, stateManager, renderer, controls, pathTracing, animationService } = this.deps;
    if (this.deps.isDisposed()) {
      renderLoopManager.stop();
      return;
    }
    if (!stateManager.isInitialized() || stateManager.getStatus() === 'error') {
      return;
    }
    if (!renderer || renderer.isDisposed()) {
      renderLoopManager.stop();
      return;
    }

    const currentTime = performance.now();
    const fps = deltaTime > 0 ? 1000 / deltaTime : 0;

    const isAnimating = animationService?.isPlaying() ?? false;
    const controlsChanged = controls.enabled && controls.update();
    if (controlsChanged) {
      this.deps.events.emit('controls:change', { controls });
      if (!isAnimating) {
        pathTracing.resetAccumulation();
      }
      renderLoopManager.requestRender();
    }

    if (isAnimating && animationService) {
      animationService.update(deltaTime / 1000);
      pathTracing.suspendWhileAnimating();
    }

    const frameState = pathTracing.beforeFrame();

    this.renderFrame().catch(error => {
      console.error('[ViewerCore] Render frame error:', error);
    });

    pathTracing.detectCompletion(frameState, currentTime);

    this.frameCount++;
    stateManager.updateRenderInfo({
      frameCount: this.frameCount,
      fps: Math.round(fps),
      lastRenderTime: performance.now() - currentTime,
    });
  }

  private async renderFrame(): Promise<void> {
    const startTime = performance.now();
    const { renderer, scene, camera, pathTracing, events } = this.deps;

    if (!renderer || !scene || !camera) {
      console.warn('[ViewerCore] Cannot render - components not initialized');
      return;
    }
    if (this.deps.isScreenshotActive()) {
      return;
    }

    this.deps.stateManager.startRendering();

    const renderResult = await (
      pathTracing.render(scene, camera) ??
      Promise.resolve(this.renderRaster())
    );

    if (!renderResult.ok) {
      console.error('[ViewerCore] Render failed:', renderResult.error);
      events.emit('error', { error: renderResult.error });
      return;
    }

    events.emit('render:complete', {
      frame: this.frameCount,
      renderTime: performance.now() - startTime,
      samples: pathTracing.getSampleCount()
    });
  }
}
