import { DisposableTimers } from '../DisposableTimers';

describe('DisposableTimers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs a scheduled callback after its delay', () => {
    const timers = new DisposableTimers(() => false);
    const callback = jest.fn();

    timers.schedule(callback, 100);
    jest.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('skips the callback when the owner was disposed before it fired', () => {
    let disposed = false;
    const timers = new DisposableTimers(() => disposed);
    const callback = jest.fn();

    timers.schedule(callback, 50);
    disposed = true;
    jest.advanceTimersByTime(50);

    expect(callback).not.toHaveBeenCalled();
  });

  it('cancels every pending callback', () => {
    const timers = new DisposableTimers(() => false);
    const first = jest.fn();
    const second = jest.fn();

    timers.schedule(first, 10);
    timers.schedule(second, 20);
    timers.cancelAll();
    jest.advanceTimersByTime(100);

    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('forgets a fired timer so cancelling afterwards clears nothing it owns', () => {
    const timers = new DisposableTimers(() => false);
    const clearSpy = jest.spyOn(global, 'clearTimeout');

    timers.schedule(jest.fn(), 10);
    jest.advanceTimersByTime(10);
    timers.cancelAll();

    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
