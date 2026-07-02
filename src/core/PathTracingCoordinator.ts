import { IPathTracingService } from './services/IPathTracingService';
import { IRenderer, IScene, ICamera, Result } from './interfaces';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/ViewerEvents';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { hasInternalRenderer } from './interfaces/IRendererExtension';
import { DEFAULT_PATH_TRACING_SAMPLES } from './constants';

/** Pre-frame snapshot used to detect completion after the frame renders. */
export interface PathTracingFrameState {
  wasActive: boolean;
  samples: number;
}

export interface PathTracingCoordinatorDependencies {
  service: IPathTracingService | undefined;
  events: TypedEventEmitter<ViewerEventMap>;
  renderLoopManager: RenderLoopManager;
  renderer: IRenderer;
  getOptions: () => SimpleViewerOptions;
  isDisposed: () => boolean;
  schedule: (callback: () => void, delayMs: number) => void;
  replaceWithScreenshot: () => void;
}

/**
 * The path-tracing lifecycle around the render loop: initialization,
 * accumulation resets, PT-aware frame rendering, completion detection and its
 * side effects (stopping the loop, screenshot replacement or preserving the
 * final frame). Extracted from ViewerCore so the orchestrator stays thin.
 */
export class PathTracingCoordinator {
  private readonly deps: PathTracingCoordinatorDependencies;
  private startTime?: number;
  private completeHandled = false;

  constructor(deps: PathTracingCoordinatorDependencies) {
    this.deps = deps;
  }

  /** True when a service exists and the options ask for path tracing. */
  isEnabled(): boolean {
    return Boolean(this.deps.service && (this.deps.getOptions().pathTracing?.enabled ?? false));
  }

  getMaxSamples(): number {
    return this.deps.getOptions().pathTracing?.maxSamples ?? DEFAULT_PATH_TRACING_SAMPLES;
  }

  /** The completion side effects already ran for the current accumulation. */
  isCompleteHandled(): boolean {
    return this.completeHandled;
  }

  /** The accumulation is still able to finish (the service is running). */
  isAccumulating(): boolean {
    return Boolean(this.deps.service?.isEnabled());
  }

  async initialize(): Promise<void> {
    const { service, getOptions, isDisposed, renderer, renderLoopManager, schedule } = this.deps;
    if (!service || !(getOptions().pathTracing?.enabled ?? false)) {
      return;
    }

    const result = await service.initialize({ enabled: true, renderer });
    if (isDisposed()) {
      return;
    }
    if (!result.ok) {
      console.warn('Failed to initialize path tracing:', result.error);
      return;
    }

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

    // The service pauses itself when accumulation stalls; wind the loop down.
    service.events.on('pathtracing:paused', () => {
      renderLoopManager.disableContinuousRendering();
      if (!getOptions().staticScene) {
        renderLoopManager.setAlwaysRender(false);
      }
      schedule(() => renderLoopManager.stop(), 100);
    });
  }

  /** Drop the accumulation (new model, camera move) so it restarts cleanly. */
  resetAccumulation(): void {
    if (this.deps.service && this.isEnabled()) {
      this.deps.service.reset();
      this.completeHandled = false;
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

  /**
   * PT-aware render for the current frame, or null when the standard renderer
   * should draw. Path tracing renders while accumulating, and also once
   * complete — re-presenting the accumulated frame preserves it on screen.
   */
  render(scene: IScene, camera: ICamera): Promise<Result<void>> | null {
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

  /**
   * Completion fires on the sample threshold, not service state — the service
   * disables itself mid-render, so state alone cannot signal "just finished".
   */
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
    const { events, renderLoopManager, getOptions, schedule, replaceWithScreenshot, renderer } = this.deps;
    this.completeHandled = true;
    renderLoopManager.disableContinuousRendering();
    if (!getOptions().staticScene) {
      renderLoopManager.setAlwaysRender(false);
    }

    events.emit('pathtracing:complete', {
      samples,
      totalTime: currentTime - (this.startTime || 0),
    });

    if (getOptions().replaceWithScreenshotOnComplete) {
      schedule(() => {
        replaceWithScreenshot();
        // Stop the render loop after the screenshot to avoid disposed-service renders
        schedule(() => renderLoopManager.stop(), 200);
      }, 100);
      return;
    }

    // Keep the final path-traced image visible: one last render, stop the loop,
    // and prevent autoClear from wiping the preserved buffer.
    renderLoopManager.requestRender();
    schedule(() => renderLoopManager.stop(), 100);
    if (hasInternalRenderer(renderer)) {
      const threeRenderer = renderer.getInternalRenderer() as { autoClear: boolean } | null;
      if (threeRenderer) {
        threeRenderer.autoClear = false;
      }
    }
  }

  /**
   * A resize invalidates a completed frame on the canvas: drop the
   * accumulation and report whether the tracer was running, so the caller can
   * re-enable it after the resize.
   */
  onResizeStart(): boolean {
    const wasActive = this.deps.service?.isEnabled() ?? false;
    if (this.deps.service && this.completeHandled) {
      this.deps.service.reset();
      this.completeHandled = false;
    }
    return wasActive;
  }

  onResizeEnd(wasActive: boolean): void {
    if (wasActive && this.deps.service) {
      this.deps.service.setEnabled(true);
    }
  }
}
