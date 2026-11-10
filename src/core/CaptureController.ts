import type * as THREE from 'three';
import type { ViewerRenderer } from './rendering/ViewerRenderer';
import { Result } from '../utils/Result';
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
import { bestEffort } from '../utils/bestEffort';

type CaptureWaitOutcome = 'complete' | 'disposed' | 'error' | 'turntable';

export interface CaptureControllerDependencies {
  renderer: ViewerRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  events: TypedEventEmitter<ViewerEventMap>;
  renderLoopManager: RenderLoopManager;
  pathTracing: PathTracingCoordinator;
  getStatus: () => string;
  isDisposed: () => boolean;
  awaitModelLoads: () => Promise<unknown>;
  reviveRenderLoop: () => void;
  isAutoRotating: () => boolean;
  isScreenshotActive: () => boolean;
}

type StreamingCanvas = HTMLCanvasElement & {
  captureStream?: (frameRate?: number) => MediaStream;
};

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

export class CaptureController {
  private readonly deps: CaptureControllerDependencies;
  private readonly pendingSettlers = new Set<(outcome: CaptureWaitOutcome) => void>();
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
    await this.deps.awaitModelLoads().catch(() => undefined);
    if (this.deps.isDisposed()) {
      return Result.err(
        new ThreeViewerError('Viewer was disposed while a model load finished', ErrorCode.INVALID_STATE)
      );
    }
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

  settleOnDispose(): void {
    [...this.pendingSettlers].forEach((settle) => settle('disposed'));
  }

  notifyTurntableEnabled(): void {
    [...this.pathTracedWaitSettlers].forEach((settle) => settle('turntable'));
  }

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

    const videoTrack = stream.getVideoTracks()[0] as
      | (MediaStreamTrack & { requestFrame?: () => void })
      | undefined;
    const requestFrame = videoTrack?.requestFrame?.bind(videoTrack);
    const offRenderComplete = requestFrame
      ? this.deps.events.on('render:complete', () => requestFrame())
      : () => {};

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
        finish(
          Result.err(
            new ThreeViewerError('Viewer was disposed during video capture', ErrorCode.INVALID_STATE)
          )
        );
        bestEffort(() => recorder.stop());
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
    if (this.deps.isAutoRotating()) {
      return Result.err(
        new ThreeViewerError(
          'Cannot capture a path-traced still while the turntable is spinning — pause autoRotate first',
          ErrorCode.INVALID_STATE
        )
      );
    }
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
      let offControlsChange = () => {};
      const settle = (outcome: CaptureWaitOutcome) => {
        this.pendingSettlers.delete(settle);
        this.pathTracedWaitSettlers.delete(settle);
        offComplete();
        offError();
        offSelfPause();
        offControlsChange();
        resolve(outcome);
      };
      this.pendingSettlers.add(settle);
      this.pathTracedWaitSettlers.add(settle);
      offComplete = this.deps.events.once('pathtracing:complete', () => settle('complete'));
      offError = this.deps.events.once('model:error', () => settle('error'));
      offSelfPause = this.deps.pathTracing.onSelfPause(() => settle('complete'));
      offControlsChange = this.deps.events.on('controls:change', () => {
        if (this.deps.isAutoRotating()) {
          settle('turntable');
        }
      });
    });
  }

  private captureRasterStill(options: CaptureStillOptions): Result<string> {
    const { renderer, scene, camera, renderLoopManager } = this.deps;
    const canvas = renderer.getDomElement();
    const livePixelRatio = renderer.getPixelRatio();
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

    const maxSize = renderer.getMaxTextureSize();
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

    renderer.setPixelRatio(1);
    renderer.setSize(targetWidth, targetHeight);
    applyCameraAspect(camera, targetWidth / targetHeight);
    const rendered = renderer.renderPostProcessed(scene, camera);
    const still = rendered.ok ? this.readCanvasPng() : Result.err(rendered.error);
    renderer.setSize(liveWidth, liveHeight);
    renderer.setPixelRatio(livePixelRatio);
    applyCameraAspect(camera, liveAspect);
    renderer.renderPostProcessed(scene, camera);
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
