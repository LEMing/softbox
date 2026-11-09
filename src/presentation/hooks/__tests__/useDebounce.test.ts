import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should debounce function calls', () => {
    const mockCallback = jest.fn();
    const delay = 200;

    const { result } = renderHook(() => useDebounce(mockCallback, delay));
    const debouncedFn = result.current;

    act(() => {
      debouncedFn('first');
      debouncedFn('second');
      debouncedFn('third');
    });

    expect(mockCallback).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(delay);
    });

    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith('third');
  });

  it('should cancel previous timeout when called again', () => {
    const mockCallback = jest.fn();
    const delay = 200;

    const { result } = renderHook(() => useDebounce(mockCallback, delay));
    const debouncedFn = result.current;

    act(() => {
      debouncedFn('first');
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    act(() => {
      debouncedFn('second');
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockCallback).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith('second');
  });

  it('should handle multiple arguments', () => {
    const mockCallback = jest.fn();
    const delay = 200;

    const { result } = renderHook(() => useDebounce(mockCallback, delay));
    const debouncedFn = result.current;

    act(() => {
      debouncedFn('arg1', 'arg2', { key: 'value' });
    });

    act(() => {
      jest.advanceTimersByTime(delay);
    });

    expect(mockCallback).toHaveBeenCalledWith('arg1', 'arg2', { key: 'value' });
  });

  it('should use the latest callback', () => {
    let callbackVersion = 1;
    const createCallback = () => jest.fn(() => callbackVersion);
    const delay = 200;

    const { result, rerender } = renderHook(
      ({ callback }) => useDebounce(callback, delay),
      { initialProps: { callback: createCallback() } }
    );

    act(() => {
      result.current();
    });

    callbackVersion = 2;
    const newCallback = createCallback();
    rerender({ callback: newCallback });

    act(() => {
      jest.advanceTimersByTime(delay);
    });

    expect(newCallback).toHaveBeenCalled();
    expect(newCallback()).toBe(2);
  });
});