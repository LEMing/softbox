import { CaptureController, CaptureControllerDependencies } from '../CaptureController';
import { RenderLoopManager } from '../utils/RenderLoopManager';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { ViewerEventMap } from '../events/CoreViewerEvents';
import { ErrorCode, ThreeViewerError } from '../../errors';

class FakeMediaRecorder {
  static supported = ['video/webm;codecs=vp9', 'video/webm'];
  static instances: FakeMediaRecorder[] = [];
  static throwOnConstruct = false;

  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    if (FakeMediaRecorder.throwOnConstruct) {
      throw new Error('recorder unavailable');
    }
    this.mimeType = options?.mimeType ?? '';
    FakeMediaRecorder.instances.push(this);
  }

  static isTypeSupported(type: string): boolean {
    return FakeMediaRecorder.supported.includes(type);
  }

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['frames'], { type: 'video/webm' }) });
    this.onstop?.();
  }
}

const tick = async (count = 4): Promise<void> => {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
};

const makeController = (overrides: Partial<CaptureControllerDependencies> = {}) => {
  const canvas = document.createElement('canvas');
  const track = { stop: jest.fn() };
  const captureStream = jest.fn(() => ({
    getTracks: () => [track],
    getVideoTracks: () => [track],
  }));
  Object.assign(canvas, { captureStream });

  const renderLoopManager = new RenderLoopManager();
  const deps = {
    renderer: { getDomElement: () => canvas },
    scene: {},
    camera: {},
    events: new TypedEventEmitter(),
    renderLoopManager,
    pathTracing: {},
    getStatus: () => 'loaded',
    isDisposed: () => false,
    awaitModelLoads: () => Promise.resolve(),
    reviveRenderLoop: jest.fn(),
    isScreenshotActive: () => false,
    ...overrides,
  } as unknown as CaptureControllerDependencies;

  return { controller: new CaptureController(deps), deps, canvas, track, captureStream };
};

describe('CaptureController.captureVideo', () => {
  let requireSpy: jest.SpyInstance;
  let releaseSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.throwOnConstruct = false;
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = FakeMediaRecorder;
    requireSpy = jest.spyOn(RenderLoopManager.prototype, 'requireContinuous');
    releaseSpy = jest.spyOn(RenderLoopManager.prototype, 'releaseContinuous');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
  });

  it('records for the duration and resolves an encoded blob', async () => {
    const { controller, deps, track, captureStream } = makeController();

    const capture = controller.captureVideo({ duration: 1, fps: 24 });
    await tick();
    expect(requireSpy).toHaveBeenCalledWith(expect.stringMatching(/^video-capture:/));
    expect(deps.reviveRenderLoop).toHaveBeenCalled();
    expect(captureStream).toHaveBeenCalledWith(24);

    jest.advanceTimersByTime(1000);
    const result = await capture;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toContain('video/webm');
      expect(result.value.size).toBeGreaterThan(0);
    }
    expect(releaseSpy).toHaveBeenCalledWith(expect.stringMatching(/^video-capture:/));
    expect(track.stop).toHaveBeenCalled();
  });

  it('keeps continuous demand for a still-running capture when a shorter overlapping one finishes first', async () => {
    const { controller, deps } = makeController();

    const shortCapture = controller.captureVideo({ duration: 1 });
    await tick();
    const longCapture = controller.captureVideo({ duration: 5 });
    await tick();

    expect(deps.renderLoopManager.hasContinuousDemand()).toBe(true);

    jest.advanceTimersByTime(1000);
    await shortCapture;

    // The long capture is still recording — its own reason must still be
    // held, not deleted by the short capture releasing a shared string.
    expect(deps.renderLoopManager.hasContinuousDemand()).toBe(true);

    jest.advanceTimersByTime(4000);
    await longCapture;

    expect(deps.renderLoopManager.hasContinuousDemand()).toBe(false);
  });

  it('forwards every rendered frame into the stream and unsubscribes at the end', async () => {
    const requestFrame = jest.fn();
    const canvas = document.createElement('canvas');
    const track = { stop: jest.fn(), requestFrame };
    Object.assign(canvas, {
      captureStream: jest.fn(() => ({
        getTracks: () => [track],
        getVideoTracks: () => [track],
      })),
    });
    const events = new TypedEventEmitter<ViewerEventMap>();
    const { controller } = makeController({
      renderer: { getDomElement: () => canvas },
      events,
    } as unknown as Partial<CaptureControllerDependencies>);

    const capture = controller.captureVideo({ duration: 1 });
    await tick();
    events.emit('render:complete', { frame: 1, renderTime: 0 });
    events.emit('render:complete', { frame: 2, renderTime: 0 });
    expect(requestFrame).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(1000);
    await capture;
    events.emit('render:complete', { frame: 3, renderTime: 0 });
    expect(requestFrame).toHaveBeenCalledTimes(2); // unsubscribed after finish
  });

  it('prefers the requested mimeType when supported, falls back otherwise', async () => {
    const { controller } = makeController();

    const capture = controller.captureVideo({ mimeType: 'video/webm', duration: 1 });
    await tick();
    expect(FakeMediaRecorder.instances[0].mimeType).toBe('video/webm');
    jest.advanceTimersByTime(1000);
    await capture;

    const fallback = controller.captureVideo({ mimeType: 'video/exotic', duration: 1 });
    await tick();
    expect(FakeMediaRecorder.instances[1].mimeType).toBe('video/webm;codecs=vp9');
    jest.advanceTimersByTime(1000);
    await fallback;
  });

  it('rejects a non-positive duration', async () => {
    const { controller } = makeController();
    const result = await controller.captureVideo({ duration: 0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as ThreeViewerError).code).toBe(ErrorCode.INVALID_PARAMETER);
    }
  });

  it('reports an unsupported environment without touching the render loop', async () => {
    delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
    const { controller } = makeController();
    const result = await controller.captureVideo();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as ThreeViewerError).code).toBe(ErrorCode.UNSUPPORTED_FORMAT);
    }
    expect(requireSpy).not.toHaveBeenCalled();
  });

  it('refuses to capture from a disposed viewer', async () => {
    const { controller } = makeController({ isDisposed: () => true });
    const result = await controller.captureVideo();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as ThreeViewerError).code).toBe(ErrorCode.INVALID_STATE);
    }
  });

  it('refuses to capture while a screenshot is replacing the canvas', async () => {
    const { controller } = makeController({ isScreenshotActive: () => true });
    const result = await controller.captureVideo();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as ThreeViewerError).code).toBe(ErrorCode.INVALID_STATE);
    }
    expect(requireSpy).not.toHaveBeenCalled();
  });

  it('settles with INVALID_STATE when the viewer is disposed mid-capture', async () => {
    const { controller, track } = makeController();

    const capture = controller.captureVideo({ duration: 5 });
    await tick();
    controller.settleOnDispose();
    const result = await capture;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as ThreeViewerError).code).toBe(ErrorCode.INVALID_STATE);
    }
    expect(releaseSpy).toHaveBeenCalledWith(expect.stringMatching(/^video-capture:/));
    expect(track.stop).toHaveBeenCalled();
  });

  it('cleans up when the recorder cannot be constructed', async () => {
    FakeMediaRecorder.throwOnConstruct = true;
    const { controller, track } = makeController();
    const result = await controller.captureVideo();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as ThreeViewerError).code).toBe(ErrorCode.OPERATION_FAILED);
    }
    expect(track.stop).toHaveBeenCalled();
  });

  it('surfaces a recorder error as OPERATION_FAILED', async () => {
    const { controller } = makeController();

    const capture = controller.captureVideo({ duration: 5 });
    await tick();
    FakeMediaRecorder.instances[0].onerror?.();
    const result = await capture;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as ThreeViewerError).code).toBe(ErrorCode.OPERATION_FAILED);
    }
    expect(releaseSpy).toHaveBeenCalledWith(expect.stringMatching(/^video-capture:/));
  });
});
