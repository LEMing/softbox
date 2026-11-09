import type * as THREE from 'three';
import { IPathTracingService } from './services/IPathTracingService';
import type { ViewerRenderer } from './rendering/ViewerRenderer';
import { Result } from '../utils/Result';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/CoreViewerEvents';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { DEFAULT_PATH_TRACING_SAMPLES } from './constants';

export interface PathTracingFrameState {
  wasActive: boolean;
  samples: number;
}

export interface PathTracingCoordinatorDependencies {
  service: IPathTracingService | undefined;
  events: TypedEventEmitter<ViewerEventMap>;
  renderLoopManager: RenderLoopManager;
  renderer: ViewerRenderer;
  getOptions: () => SimpleViewerOptions;
  isDisposed: () => boolean;
  schedule: (callback: () => void, delayMs: number) => void;
  replaceWithScreenshot: () => void;
}

export class PathTracingCoordinator {
  private readonly deps: PathTracingCoordinatorDependencies;
  private startTime?: number;
  private completeHandled = false;
  private suspendedForAnimation = false;
  private initialized = false;
  private initializing = false;
  private readonly selfPauseListeners = new Set<() => void>();

  constructor(deps: PathTracingCoordinatorDependencies) {
    this.deps = deps;
  }

  isEnabled(): boolean {
    return Boolean(this.deps.service && (this.deps.getOptions().pathTracing?.enabled ?? false));
  }

  getMaxSamples(): number {
    return this.deps.getOptions().pathTracing?.maxSamples ?? DEFAULT_PATH_TRACING_SAMPLES;
  }

  isCompleteHandled(): boolean {
    return this.completeHandled;
  }

  isAccumulating(): boolean {
    return Boolean(this.deps.service?.isEnabled());
  }

  onSelfPause(callback: () => void): () => void {
    this.selfPauseListeners.add(callback);
    return () => this.selfPauseListeners.delete(callback);
  }

  async initialize(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.ensureInitialized();
  }

  private async ensureInitialized(): Promise<void> {
    const { service, getOptions, isDisposed, renderer, renderLoopManager, schedule } = this.deps;
    if (!service || this.initialized || this.initializing) {
      return;
    }
    this.initializing = true;
    try {
      const result = await service.initialize({ enabled: true, renderer });
      if (isDisposed()) {
        return;
      }
      if (!result.ok) {
        this.deps.events.emit('error', { error: result.error });
        console.warn('Failed to initialize path tracing:', result.error);
        return;
      }
      this.initialized = true;

      const pathTracing = getOptions().pathTracing;
      if (pathTracing) {
        service.updateSettings({
          samples: pathTracing.maxSamples ?? DEFAULT_PATH_TRACING_SAMPLES,
          bounces: pathTracing.bounces,
          transmissiveBounces: pathTracing.transmissiveBounces,
          renderScale: pathTracing.renderScale,
          lowResScale: pathTracing.lowResScale,
          dynamicLowRes: pathTracing.dynamicLowRes,
          enablePathTracing: pathTracing.enabled ?? true,
        });
      }

      service.events.on('pathtracing:paused', ({ reason }) => {
        renderLoopManager.releaseContinuous('path-tracing');
        const staticScene = Boolean(getOptions().staticScene);
        if (!staticScene) {
          renderLoopManager.setAlwaysRender(reason === 'gave-up');
        }
        const loopStaysAlive = !staticScene && reason === 'gave-up';
        if (!loopStaysAlive) {
          schedule(() => {
            if (!renderLoopManager.hasContinuousDemand()) {
              renderLoopManager.stop();
            }
          }, 100);
        }
        if (reason === 'gave-up') {
          this.selfPauseListeners.forEach((callback) => callback());
        }
      });
    } finally {
      this.initializing = false;
    }
  }

  async enableRuntime(): Promise<boolean> {
    const { service, renderLoopManager, getOptions } = this.deps;
    if (!service) {
      return false;
    }
    await this.ensureInitialized();
    if (!this.initialized) {
      return false;
    }
    if (!(getOptions().pathTracing?.enabled ?? false)) {
      return false;
    }
    service.setEnabled(true);
    service.reset(true);
    this.completeHandled = false;
    this.suspendedForAnimation = false;
    renderLoopManager.requireContinuous('path-tracing');
    return true;
  }

  disableRuntime(): void {
    const { service, renderLoopManager } = this.deps;
    if (!service) {
      return;
    }
    service.setEnabled(false);
    service.reset();
    renderLoopManager.releaseContinuous('path-tracing');
    if (!this.deps.getOptions().staticScene) {
      renderLoopManager.setAlwaysRender(true);
    }
    this.completeHandled = false;
    this.suspendedForAnimation = false;
    this.selfPauseListeners.forEach((callback) => callback());
  }

  resetAccumulation(force = false): void {
    const { service, renderLoopManager } = this.deps;
    if (!service || !this.isEnabled()) {
      return;
    }
    service.reset(force);
    this.completeHandled = false;
    if (!service.isEnabled() && (service.canResume() || this.suspendedForAnimation)) {
      this.suspendedForAnimation = false;
      service.setEnabled(true);
      renderLoopManager.requireContinuous('path-tracing');
    }
  }

  suspendWhileAnimating(): void {
    const service = this.deps.service;
    if (!service) {
      return;
    }
    if (service.isEnabled()) {
      const firstSuspend = !this.suspendedForAnimation;
      this.suspendedForAnimation = true;
      service.setEnabled(false);
      this.deps.renderLoopManager.releaseContinuous('path-tracing');
      if (firstSuspend) {
        this.selfPauseListeners.forEach((callback) => callback());
      }
    } else if (service.canResume() && service.getSampleCount() > 0) {
      service.reset();
      this.completeHandled = false;
      this.suspendedForAnimation = true;
    }
  }

  getSampleCount(): number {
    return this.deps.service?.getSampleCount() || 0;
  }

  beforeFrame(): PathTracingFrameState {
    return {
      wasActive: this.deps.service?.isEnabled() || false,
      samples: this.getSampleCount(),
    };
  }

  render(scene: THREE.Scene, camera: THREE.Camera): Promise<Result<void>> | null {
    const service = this.deps.service;
    if (!service || service.isPathTracerDisposed()) {
      return null;
    }
    const samples = service.getSampleCount();
    const preservingCompletedFrame = samples >= this.getMaxSamples() && samples > 0;
    if (!service.isEnabled() && !preservingCompletedFrame) {
      return null;
    }
    if (samples === 0) {
      this.startTime = performance.now();
    }
    return service.render(scene, camera);
  }

  detectCompletion(frame: PathTracingFrameState, currentTime: number): void {
    const service = this.deps.service;
    if (!service) {
      return;
    }
    const samples = service.getSampleCount() || 0;
    if (samples >= this.getMaxSamples() && !this.completeHandled && frame.wasActive) {
      this.handleComplete(frame.samples, currentTime);
    }
  }

  private handleComplete(samples: number, currentTime: number): void {
    const { events, renderLoopManager, getOptions, schedule, replaceWithScreenshot } = this.deps;
    this.completeHandled = true;
    renderLoopManager.releaseContinuous('path-tracing');
    if (!getOptions().staticScene) {
      renderLoopManager.setAlwaysRender(false);
    }

    events.emit('pathtracing:complete', {
      samples,
      totalTime: currentTime - (this.startTime || 0),
    });

    const stopUnlessDemanded = () => {
      if (!renderLoopManager.hasContinuousDemand()) {
        renderLoopManager.stop();
      }
    };

    if (getOptions().replaceWithScreenshotOnComplete) {
      schedule(() => {
        replaceWithScreenshot();
        schedule(stopUnlessDemanded, 200);
      }, 100);
      return;
    }

    renderLoopManager.requestRender();
    schedule(stopUnlessDemanded, 100);
  }

}
