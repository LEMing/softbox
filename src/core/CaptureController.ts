import { IRenderer, IScene, ICamera, Result } from './interfaces';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/CoreViewerEvents';
import { ThreeViewerError, ErrorCode } from '../errors';
import { CaptureStillOptions } from '../types/CaptureStillOptions';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { PathTracingCoordinator } from './PathTracingCoordinator';
import { applyCameraAspect } from './utils/cameraAspect';
import { canvasToPngDataUrl } from './utils/canvasPng';

type CaptureWaitOutcome = 'complete' | 'disposed' | 'error';

export interface CaptureControllerDependencies {
  renderer: IRenderer;
  scene: IScene;
  camera: ICamera;
  events: TypedEventEmitter<ViewerEventMap>;
  renderLoopManager: RenderLoopManager;
  pathTracing: PathTracingCoordinator;
  getStatus: () => string;
  isDisposed: () => boolean;
  awaitModelLoads: () => Promise<unknown>;
}

/**
 * The captureStill subsystem, extracted from ViewerCore.
 *
 * Raster mode renders one fresh frame at the requested resolution (the
 * drawing buffer is temporarily resized with pixel ratio 1, so `width` ×
 * `height` are exact output pixels) and restores the live size afterwards —
 * all synchronously, so nothing flickers on screen. Path-traced mode waits
 * for the accumulation to complete and captures the canvas as-is; the
 * accumulated samples exist only at the canvas resolution, so an explicit
 * `width`/`height` is rejected rather than silently downgraded to a
 * non-path-traced render.
 */
export class CaptureController {
  private readonly deps: CaptureControllerDependencies;
  // Pending waiters, settled by settleOnDispose() so their promises never
  // dangle after teardown.
  private readonly pendingSettlers = new Set<(outcome: CaptureWaitOutcome) => void>();

  constructor(deps: CaptureControllerDependencies) {
    this.deps = deps;
  }

  async captureStill(options: CaptureStillOptions = {}): Promise<Result<string>> {
    if (this.deps.isDisposed()) {
      return Result.err(
        new ThreeViewerError('Cannot capture a still from a disposed viewer', ErrorCode.INVALID_STATE)
      );
    }
    // A capture taken mid-load would show the previous scene; let queued model
    // loads finish first.
    await this.deps.awaitModelLoads().catch(() => undefined);
    if (this.deps.isDisposed()) {
      return Result.err(
        new ThreeViewerError('Viewer was disposed while a model load finished', ErrorCode.INVALID_STATE)
      );
    }
    if (this.deps.pathTracing.isEnabled()) {
      return this.capturePathTracedStill(options);
    }
    return this.captureRasterStill(options);
  }

  /** Resolve any pending waiters so their capture promises settle. */
  settleOnDispose(): void {
    [...this.pendingSettlers].forEach((settle) => settle('disposed'));
  }

  private async capturePathTracedStill(options: CaptureStillOptions): Promise<Result<string>> {
    if (options.width !== undefined || options.height !== undefined) {
      return Result.err(
        new ThreeViewerError(
          'Path-traced stills are captured at the canvas resolution; omit width/height',
          ErrorCode.INVALID_PARAMETER
        )
      );
    }
    // Wait only while the accumulation can still finish. A disabled service
    // (post-completion reset, failed init, internal error) will never emit
    // 'pathtracing:complete' again — capture the canvas as it stands instead
    // of pending forever.
    const accumulating =
      this.deps.pathTracing.isAccumulating() && this.deps.getStatus() !== 'error';
    if (!this.deps.pathTracing.isCompleteHandled() && accumulating) {
      const outcome = await this.waitForPathTracingOutcome();
      if (outcome === 'disposed') {
        return Result.err(
          new ThreeViewerError('Viewer was disposed while waiting for the path tracer', ErrorCode.INVALID_STATE)
        );
      }
      if (outcome === 'error') {
        return Result.err(
          new ThreeViewerError('Model failed while waiting for the path tracer', ErrorCode.RENDER_FAILED)
        );
      }
    }
    return this.readCanvasPng();
  }

  private waitForPathTracingOutcome(): Promise<CaptureWaitOutcome> {
    return new Promise<CaptureWaitOutcome>((resolve) => {
      let offComplete = () => {};
      let offError = () => {};
      const settle = (outcome: CaptureWaitOutcome) => {
        this.pendingSettlers.delete(settle);
        offComplete();
        offError();
        resolve(outcome);
      };
      this.pendingSettlers.add(settle);
      offComplete = this.deps.events.once('pathtracing:complete', () => settle('complete'));
      offError = this.deps.events.once('model:error', () => settle('error'));
    });
  }

  private captureRasterStill(options: CaptureStillOptions): Result<string> {
    const { renderer, scene, camera, renderLoopManager } = this.deps;
    const canvas = renderer.getDomElement();
    const livePixelRatio = renderer.getPixelRatio();
    // A hidden or detached canvas has no client size; scale the drawing buffer
    // back to logical pixels instead of mistaking buffer pixels for CSS ones.
    const hasLayout = canvas.clientWidth > 0 && canvas.clientHeight > 0;
    const liveWidth = hasLayout ? canvas.clientWidth : Math.round(canvas.width / livePixelRatio);
    const liveHeight = hasLayout ? canvas.clientHeight : Math.round(canvas.height / livePixelRatio);
    if (liveWidth <= 0 || liveHeight <= 0) {
      return Result.err(
        new ThreeViewerError('Cannot capture: the canvas has no size', ErrorCode.INVALID_STATE)
      );
    }
    const liveAspect = liveWidth / liveHeight;

    const targetWidth = Math.round(
      options.width ?? (options.height !== undefined ? options.height * liveAspect : liveWidth * livePixelRatio)
    );
    const targetHeight = Math.round(
      options.height ?? (options.width !== undefined ? options.width / liveAspect : liveHeight * livePixelRatio)
    );

    const maxSize = renderer.capabilities.maxTextureSize;
    if (
      !Number.isFinite(targetWidth) || !Number.isFinite(targetHeight) ||
      targetWidth <= 0 || targetHeight <= 0 ||
      targetWidth > maxSize || targetHeight > maxSize
    ) {
      return Result.err(
        new ThreeViewerError(
          `Requested still size ${targetWidth}x${targetHeight} is outside 1..${maxSize}`,
          ErrorCode.INVALID_PARAMETER
        )
      );
    }

    // The whole resize → render → read → restore cycle runs in one task, so
    // the intermediate size is never painted to screen. The renderer is driven
    // directly rather than through resize(): its change-detection guard
    // compares buffer pixels to logical pixels and could skip the restore.
    renderer.setPixelRatio(1);
    renderer.setSize(targetWidth, targetHeight);
    applyCameraAspect(camera, targetWidth / targetHeight);
    const rendered = renderer.render(scene, camera);
    const still = rendered.ok ? this.readCanvasPng() : Result.err(rendered.error);
    // Size first, ratio second: three re-applies the last logical size when the
    // pixel ratio changes, so this order never allocates a target×DPR buffer.
    renderer.setSize(liveWidth, liveHeight);
    renderer.setPixelRatio(livePixelRatio);
    applyCameraAspect(camera, liveAspect);
    renderer.render(scene, camera);
    renderLoopManager.requestRender();
    return still;
  }

  private readCanvasPng(): Result<string> {
    const dataUrl = canvasToPngDataUrl(this.deps.renderer.getDomElement());
    if (!dataUrl) {
      return Result.err(
        new ThreeViewerError('Canvas produced an empty image', ErrorCode.RENDER_FAILED)
      );
    }
    return Result.ok(dataUrl);
  }
}
