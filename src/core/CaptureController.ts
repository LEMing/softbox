import { IRenderer, IScene, ICamera, Result } from './interfaces';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/CoreViewerEvents';
import { ThreeViewerError, ErrorCode } from '../errors';
import { CaptureStillOptions } from '../types/CaptureStillOptions';
import { CaptureVideoOptions } from '../types/CaptureVideoOptions';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { PathTracingCoordinator } from './PathTracingCoordinator';
import { applyCameraAspect } from './utils/cameraAspect';
import { canvasToPngDataUrl } from './utils/canvasPng';
import { generateUUID } from '../utils/uuid';

type CaptureWaitOutcome = 'complete' | 'disposed' | 'error' | 'turntable';

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
  /** Restarts a render loop that idle detection has stopped (staticScene). */
  reviveRenderLoop: () => void;
  /** Whether the turntable is currently spinning the camera. */
  isAutoRotating: () => boolean;
  /** Whether the canvas is currently hidden behind a captured screenshot image. */
  isScreenshotActive: () => boolean;
}

type StreamingCanvas = HTMLCanvasElement & {
  captureStream?: (frameRate?: number) => MediaStream;
};

/** Best supported container/codec, preferring the caller's choice. */
const pickVideoMimeType = (preferred?: string): string | undefined => {
  const candidates = [
    preferred,
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
};

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
  // Path-traced-still waiters only: notifyTurntableEnabled() settles these
  // without touching video captures (which a turntable does not invalidate).
  private readonly pathTracedWaitSettlers = new Set<(outcome: CaptureWaitOutcome) => void>();

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
    // A screenshot replaces the canvas with a plain <img>; the live scene
    // behind it may already be torn down (resources released once the
    // capture was validated), so reading the canvas would be meaningless.
    if (this.deps.isScreenshotActive()) {
      return Result.err(
        new ThreeViewerError(
          'Cannot capture a still while a screenshot is replacing the canvas',
          ErrorCode.INVALID_STATE
        )
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

  /**
   * A turntable enabled mid-wait resets the path-traced accumulation every
   * frame, so a pending capture's wait-for-completion can never converge —
   * settle it now (it rejects with the same INVALID_STATE the up-front
   * turntable check uses).
   */
  notifyTurntableEnabled(): void {
    [...this.pathTracedWaitSettlers].forEach((settle) => settle('turntable'));
  }

  /**
   * Records the live canvas for `duration` seconds via MediaRecorder and
   * resolves with the encoded clip (WebM in Chromium/Firefox, MP4 in Safari).
   * The render loop is held continuous for the whole take, so turntable and
   * animation motion make it into the clip even on otherwise static scenes.
   */
  async captureVideo(options: CaptureVideoOptions = {}): Promise<Result<Blob>> {
    if (this.deps.isDisposed()) {
      return Result.err(
        new ThreeViewerError('Cannot capture video from a disposed viewer', ErrorCode.INVALID_STATE)
      );
    }
    await this.deps.awaitModelLoads().catch(() => undefined);
    if (this.deps.isDisposed()) {
      return Result.err(
        new ThreeViewerError('Viewer was disposed while a model load finished', ErrorCode.INVALID_STATE)
      );
    }
    if (this.deps.isScreenshotActive()) {
      return Result.err(
        new ThreeViewerError(
          'Cannot capture video while a screenshot is replacing the canvas',
          ErrorCode.INVALID_STATE
        )
      );
    }

    const duration = options.duration ?? 3;
    if (!(duration > 0)) {
      return Result.err(
        new ThreeViewerError('Video duration must be a positive number of seconds', ErrorCode.INVALID_PARAMETER)
      );
    }

    const canvas = this.deps.renderer.getDomElement() as StreamingCanvas;
    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      return Result.err(
        new ThreeViewerError(
          'Video capture needs MediaRecorder and canvas.captureStream support',
          ErrorCode.UNSUPPORTED_FORMAT
        )
      );
    }

    const stream = canvas.captureStream(options.fps ?? 30);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: pickVideoMimeType(options.mimeType),
        videoBitsPerSecond: options.videoBitsPerSecond,
      });
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      return Result.err(
        new ThreeViewerError('Failed to start the video recorder', ErrorCode.OPERATION_FAILED, {
          originalError: error,
        })
      );
    }

    // Under heavy rAF throttling (contended CI, background tabs) auto-capture
    // can push zero frames into the stream; explicitly forward every rendered
    // frame where the platform supports it.
    const videoTrack = stream.getVideoTracks()[0] as
      | (MediaStreamTrack & { requestFrame?: () => void })
      | undefined;
    const requestFrame = videoTrack?.requestFrame?.bind(videoTrack);
    const offRenderComplete = requestFrame
      ? this.deps.events.on('render:complete', () => requestFrame())
      : () => {};

    // A unique reason per take: two overlapping captureVideo() calls must not
    // share one 'video-capture' string, or the first to finish releases it out
    // from under the other, starving its still-recording frame forwarding.
    const continuousReason = `video-capture:${generateUUID()}`;
    this.deps.renderLoopManager.requireContinuous(continuousReason);
    this.deps.reviveRenderLoop();
    this.deps.renderLoopManager.requestRender();

    return new Promise<Result<Blob>>((resolve) => {
      const chunks: BlobPart[] = [];
      let stopTimer: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      const finish = (result: Result<Blob>) => {
        if (settled) {
          return;
        }
        settled = true;
        this.pendingSettlers.delete(onDispose);
        offRenderComplete();
        if (stopTimer !== null) {
          clearTimeout(stopTimer);
        }
        this.deps.renderLoopManager.releaseContinuous(continuousReason);
        stream.getTracks().forEach((track) => track.stop());
        resolve(result);
      };

      const onDispose = () => {
        // Settle FIRST: whether the recorder fires its stop event sync or
        // async, the partial clip must not win over the dispose error.
        finish(
          Result.err(
            new ThreeViewerError('Viewer was disposed during video capture', ErrorCode.INVALID_STATE)
          )
        );
        try {
          recorder.stop();
        } catch {
          // Already inactive — nothing to stop.
        }
      };
      this.pendingSettlers.add(onDispose);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onstop = () => {
        finish(Result.ok(new Blob(chunks, { type: recorder.mimeType || 'video/webm' })));
      };
      recorder.onerror = () => {
        finish(
          Result.err(
            new ThreeViewerError('Video recording failed', ErrorCode.OPERATION_FAILED)
          )
        );
      };

      // A timeslice flushes chunks periodically, so a slow encoder still
      // materializes data by the time the take ends.
      recorder.start(250);
      stopTimer = setTimeout(() => {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      }, duration * 1000);
    });
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
    // A spinning turntable resets the accumulation on every frame the camera
    // moves, so it can never reach the sample target — waiting below would
    // hang forever. Fail fast instead of guessing at a degraded capture.
    if (this.deps.isAutoRotating()) {
      return Result.err(
        new ThreeViewerError(
          'Cannot capture a path-traced still while the turntable is spinning — pause autoRotate first',
          ErrorCode.INVALID_STATE
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
      if (outcome === 'turntable') {
        return Result.err(
          new ThreeViewerError(
            'Cannot capture a path-traced still while the turntable is spinning — pause autoRotate first',
            ErrorCode.INVALID_STATE
          )
        );
      }
    }
    return this.readCanvasPng();
  }

  private waitForPathTracingOutcome(): Promise<CaptureWaitOutcome> {
    return new Promise<CaptureWaitOutcome>((resolve) => {
      let offComplete = () => {};
      let offError = () => {};
      let offSelfPause = () => {};
      const settle = (outcome: CaptureWaitOutcome) => {
        this.pendingSettlers.delete(settle);
        this.pathTracedWaitSettlers.delete(settle);
        offComplete();
        offError();
        offSelfPause();
        resolve(outcome);
      };
      this.pendingSettlers.add(settle);
      this.pathTracedWaitSettlers.add(settle);
      offComplete = this.deps.events.once('pathtracing:complete', () => settle('complete'));
      offError = this.deps.events.once('model:error', () => settle('error'));
      // The tracer can give up on the accumulation without ever completing
      // (renderer never ready, environment never arrived, or the camera kept
      // moving and reset it every frame). The canvas still holds a valid
      // standard-render fallback frame, so capture it rather than hang.
      offSelfPause = this.deps.pathTracing.onSelfPause(() => settle('complete'));
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
