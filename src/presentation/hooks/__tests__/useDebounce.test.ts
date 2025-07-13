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

    // Call the debounced function multiple times
    act(() => {
      debouncedFn('first');
      debouncedFn('second');
      debouncedFn('third');
    });

    // Callback should not be called immediately
    expect(mockCallback).not.toHaveBeenCalled();

    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(delay);
    });

    // Callback should be called only once with the last arguments
    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith('third');
  });

  it('should cancel previous timeout when called again', () => {
    const mockCallback = jest.fn();
    const delay = 200;

    const { result } = renderHook(() => useDebounce(mockCallback, delay));
    const debouncedFn = result.current;

    // First call
    act(() => {
      debouncedFn('first');
    });

    // Advance timer partially
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // Second call should cancel the first
    act(() => {
      debouncedFn('second');
    });

    // Advance timer to complete first delay
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // First call should not execute
    expect(mockCallback).not.toHaveBeenCalled();

    // Advance timer to complete second delay
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // Only second call should execute
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

    // Call with first callback
    act(() => {
      result.current();
    });

    // Update callback
    callbackVersion = 2;
    const newCallback = createCallback();
    rerender({ callback: newCallback });

    // Complete the timeout
    act(() => {
      jest.advanceTimersByTime(delay);
    });

    // Should call the new callback, not the old one
    expect(newCallback).toHaveBeenCalled();
    expect(newCallback()).toBe(2);
  });
});