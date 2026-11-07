import { deferToNextFrame } from '../deferToNextFrame';

describe('deferToNextFrame', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs the callback only after both rAF + macrotask hops (two painted frames)', () => {
    jest.useFakeTimers();
    const callback = jest.fn();

    deferToNextFrame(callback);

    // Synchronously: nothing.
    expect(callback).not.toHaveBeenCalled();
    // First frame + its macrotask: still nothing — one painted frame is not
    // enough (the overlay-unmount paint would be held hostage).
    jest.advanceTimersByTime(20);
    expect(callback).not.toHaveBeenCalled();
    // Second frame + its macrotask: now it runs.
    jest.advanceTimersByTime(20);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('falls back to a plain macrotask where rAF does not exist (SSR, workers)', () => {
    // Fake timers first: they install their own rAF mock, which must also be
    // removed for the fallback branch to run.
    jest.useFakeTimers();
    const original = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = undefined as unknown as typeof requestAnimationFrame;
    const callback = jest.fn();

    try {
      deferToNextFrame(callback);
      jest.advanceTimersByTime(10);
      expect(callback).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.requestAnimationFrame = original;
    }
  });
});
