import { IPathTracingService } from './services/IPathTracingService';
import { IRenderer, IScene, ICamera, Result } from './interfaces';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/CoreViewerEvents';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
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
  private suspendedForAnimation = false;
  private initialized = false;
  private initializing = false;
  private readonly selfPauseListeners = new Set<() => void>();

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

  /**
   * Notified when the service gives up on its current accumulation without
   * reaching the sample target (as opposed to a normal completion). Lets a
   * caller awaiting `'pathtracing:complete'` (e.g. captureStill) settle
   * instead of waiting on an event that will never fire.
   */
  onSelfPause(callback: () => void): () => void {
    this.selfPauseListeners.add(callback);
    return () => this.selfPauseListeners.delete(callback);
  }

  async initialize(): Promise<void> {
    // Only boot the tracer eagerly when it starts enabled; otherwise the lazy
    // service stays uninitialized until a runtime enable asks for it.
    if (!this.isEnabled()) {
      return;
    }
    await this.ensureInitialized();
  }

  /**
   * Load and configure the tracer once — on boot if it starts enabled, or on
   * the first runtime enable. The three-gpu-pathtracer chunk imports here, so
   * keeping it out of the boot path when path tracing is off is what the lazy
   * service buys us. Idempotent: repeated calls after the first are no-ops.
   */
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
        // A consumer who set pathTracing.enabled must be able to SEE that it
        // could not start (no WebGL2, chunk fetch failed) — a console line is
        // invisible to programs.
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

      // The service pauses itself when accumulation stalls; wind the loop down —
      // unless another subsystem (turntable, animations) still needs frames.
      service.events.on('pathtracing:paused', ({ reason }) => {
        renderLoopManager.releaseContinuous('path-tracing');
        if (!getOptions().staticScene) {
          renderLoopManager.setAlwaysRender(false);
        }
        schedule(() => {
          if (!renderLoopManager.hasContinuousDemand()) {
            renderLoopManager.stop();
          }
        }, 100);
        if (reason === 'gave-up') {
          this.selfPauseListeners.forEach((callback) => callback());
        }
      });
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Turn path tracing on for a live viewer (no rebuild, no model refetch).
   * Loads the tracer on first use, ingests the current scene from scratch, and
   * demands continuous frames so accumulation runs. Returns whether the tracer
   * is now active — false when it could not initialize (e.g. no WebGL2).
   */
  async enableRuntime(): Promise<boolean> {
    const { service, renderLoopManager, getOptions } = this.deps;
    if (!service) {
      return false;
    }
    await this.ensureInitialized();
    if (!this.initialized) {
      return false;
    }
    // A disable can land while the tracer chunk was loading (the await above).
    // updateOptions merges the request before calling us, so the option now
    // reflects the LATEST intent — honor it, or a stale enable would turn the
    // tracer back on and leak a 'path-tracing' continuous-render demand behind
    // a UI that reads OFF.
    if (!(getOptions().pathTracing?.enabled ?? false)) {
      return false;
    }
    service.setEnabled(true);
    // Re-ingest: the scene it last saw (if any) is stale, and a fresh enable
    // must start a clean accumulation from the current camera.
    service.reset(true);
    this.completeHandled = false;
    this.suspendedForAnimation = false;
    renderLoopManager.requireContinuous('path-tracing');
    return true;
  }

  /**
   * Turn path tracing off for a live viewer: hand the canvas back to the raster
   * renderer and drop the loop demand. The tracer stays loaded for a cheap
   * re-enable.
   */
  disableRuntime(): void {
    const { service, renderLoopManager } = this.deps;
    if (!service) {
      return;
    }
    service.setEnabled(false);
    // A converged tracer already self-paused, so setEnabled(false) above is a
    // no-op and the completed frame is still being PRESERVED on the canvas
    // (samples >= target). Zero the accumulation so the render path hands the
    // canvas back to the raster renderer instead of freezing on the last
    // path-traced frame.
    service.reset();
    renderLoopManager.releaseContinuous('path-tracing');
    this.completeHandled = false;
    this.suspendedForAnimation = false;
    // A capture awaiting 'pathtracing:complete' must not hang forever now that
    // the accumulation will never finish — settle it with the raster frame.
    this.selfPauseListeners.forEach((callback) => callback());
  }

  /**
   * Drop the accumulation (new model, camera move) so it restarts cleanly.
   * `force` marks the ingested scene stale (model swap, pose change) so the
   * next render re-ingests it instead of just re-syncing the camera.
   *
   * A paused accumulation (converged frame on screen, or suspended for
   * animation playback) is re-armed here: without this, the first camera
   * move after convergence left a stale frame frozen on the canvas with
   * nothing ever accumulating again. Give-up pauses stay paused —
   * `canResume()` is false when there is nothing warm to resume.
   */
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

  /**
   * Called every frame while animations play: animated geometry can never
   * converge (the ingested BVH pictures one pose), so accumulation is
   * suspended — the raster renderer shows the motion — and resumed by the
   * next resetAccumulation once playback pauses. The tracer stays warm.
   */
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
        // A capture awaiting 'pathtracing:complete' must not hang for the
        // whole playback — settle it with the raster frame, exactly like
        // the give-up paths do.
        this.selfPauseListeners.forEach((callback) => callback());
      }
    } else if (service.canResume() && service.getSampleCount() > 0) {
      // A converged frame was preserving the canvas via the completed-state
      // short-circuit; playback needs live raster frames, so drop the
      // preserved sample count. The pause-time forced reset re-ingests the
      // resting pose afterwards.
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

    // Stopping the loop freezes the final frame; only legal while nothing
    // else (turntable, animations) still needs it running.
    const stopUnlessDemanded = () => {
      if (!renderLoopManager.hasContinuousDemand()) {
        renderLoopManager.stop();
      }
    };

    if (getOptions().replaceWithScreenshotOnComplete) {
      schedule(() => {
        replaceWithScreenshot();
        // Stop the render loop after the screenshot to avoid disposed-service renders
        schedule(stopUnlessDemanded, 200);
      }, 100);
      return;
    }

    // Keep the final path-traced image visible: one last render (which the
    // completed-state short-circuit turns into a no-op, preserving the
    // buffer) and stop the loop. autoClear must stay ON — disabling it here
    // used to outlive the completion and stack every post-convergence raster
    // frame over the last one, tearing the model apart on the next drag.
    renderLoopManager.requestRender();
    schedule(stopUnlessDemanded, 100);
  }

}
