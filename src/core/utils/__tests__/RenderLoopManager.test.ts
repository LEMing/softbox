import { RenderLoopManager } from '../RenderLoopManager';

describe('RenderLoopManager continuous-rendering reasons', () => {
  let rafCallbacks: FrameRequestCallback[];
  let now: number;

  const pumpFrame = () => {
    now += 100;
    const callbacks = rafCallbacks;
    rafCallbacks = [];
    callbacks.forEach((callback) => callback(now));
  };

  beforeEach(() => {
    jest.useFakeTimers();
    rafCallbacks = [];
    now = 0;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const makeIdleManager = () =>
    new RenderLoopManager({
      enableIdleDetection: true,
      idleDelay: 50,
      enableFrameRateLimiting: false,
    });

  it('keeps continuous rendering while ANY reason is held', () => {
    const manager = makeIdleManager();
    manager.requireContinuous('path-tracing');
    manager.requireContinuous('turntable');

    // The path tracer finishing must not stall the turntable.
    manager.releaseContinuous('path-tracing');
    expect(manager.hasContinuousDemand()).toBe(true);
    expect(manager.getNeedsRender()).toBe(true);

    manager.releaseContinuous('turntable');
    expect(manager.hasContinuousDemand()).toBe(false);
  });

  it('renders every frame while a reason is held, then idles out after release', () => {
    const manager = makeIdleManager();
    const render = jest.fn();
    manager.start(render);
    pumpFrame(); // initial needsRender
    render.mockClear();

    manager.requireContinuous('turntable');
    pumpFrame();
    pumpFrame();
    expect(render).toHaveBeenCalledTimes(2);

    manager.releaseContinuous('turntable');
    manager.requestRender(); // the final frame arms the idle timer
    pumpFrame();
    render.mockClear();
    pumpFrame(); // nothing demands a render anymore
    expect(render).not.toHaveBeenCalled();

    // After the idle delay the loop stops scheduling frames entirely.
    jest.advanceTimersByTime(60);
    pumpFrame();
    expect(rafCallbacks).toHaveLength(0);
    expect(manager.isRunning()).toBe(false);
  });

  it('stop() clears all held reasons', () => {
    const manager = makeIdleManager();
    manager.requireContinuous('turntable');
    manager.stop();
    expect(manager.hasContinuousDemand()).toBe(false);
  });

  it('idles out after a bare releaseContinuous with no following render request', () => {
    // Regression: releaseContinuous() can drop demand to zero on a frame that
    // renders nothing (needsRender was already false going in). The idle timer
    // must still arm on that exact frame, not only on frames that rendered.
    const manager = makeIdleManager();
    const render = jest.fn();
    manager.start(render);
    pumpFrame(); // initial needsRender
    render.mockClear();

    manager.requireContinuous('video-capture');
    pumpFrame();
    expect(render).toHaveBeenCalledTimes(1);

    manager.releaseContinuous('video-capture');
    pumpFrame(); // nothing demands a render on this frame — must still arm idle
    render.mockClear();
    pumpFrame();
    expect(render).not.toHaveBeenCalled();

    jest.advanceTimersByTime(60);
    pumpFrame();
    expect(rafCallbacks).toHaveLength(0);
    expect(manager.isRunning()).toBe(false);
  });
});
