import { act, renderHook } from '@testing-library/react';
import { useViewportGate } from '../useViewportGate';

const makeTargetRef = () => ({ current: document.createElement('canvas') });

describe('useViewportGate', () => {
  let intersect: ((isIntersecting: boolean) => void) | null;
  let observe: jest.Mock;
  let disconnect: jest.Mock;
  let observerConstructor: jest.Mock;

  const installIntersectionObserver = () => {
    intersect = null;
    observe = jest.fn();
    disconnect = jest.fn();
    observerConstructor = jest.fn((callback: IntersectionObserverCallback) => {
      intersect = (isIntersecting: boolean) =>
        callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
      return { observe, disconnect, unobserve: jest.fn() };
    });
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = observerConstructor;
  };

  afterEach(() => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  });

  it('opens immediately when gating is disabled, without touching the observer', () => {
    installIntersectionObserver();
    const { result } = renderHook(() => useViewportGate(makeTargetRef(), false));

    expect(result.current).toBe(true);
    expect(observerConstructor).not.toHaveBeenCalled();
  });

  it('opens immediately when IntersectionObserver is unavailable', () => {
    const { result } = renderHook(() => useViewportGate(makeTargetRef(), true));

    expect(result.current).toBe(true);
  });

  it('stays closed until the target intersects, then opens and disconnects', () => {
    installIntersectionObserver();
    const targetRef = makeTargetRef();
    const { result } = renderHook(() => useViewportGate(targetRef, true));

    expect(result.current).toBe(false);
    expect(observe).toHaveBeenCalledWith(targetRef.current);

    act(() => intersect!(true));

    expect(result.current).toBe(true);
    expect(disconnect).toHaveBeenCalled();
  });

  it('ignores deliveries that do not intersect', () => {
    installIntersectionObserver();
    const { result } = renderHook(() => useViewportGate(makeTargetRef(), true));

    act(() => intersect!(false));

    expect(result.current).toBe(false);
  });

  it('latches: no later delivery or enabled flip ever closes it', () => {
    installIntersectionObserver();
    const targetRef = makeTargetRef();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useViewportGate(targetRef, enabled),
      { initialProps: { enabled: true } }
    );

    act(() => intersect!(true));
    expect(result.current).toBe(true);

    act(() => intersect!(false));
    expect(result.current).toBe(true);

    rerender({ enabled: false });
    rerender({ enabled: true });
    expect(result.current).toBe(true);
  });

  it('a disabled mount stays open when gating is enabled later', () => {
    installIntersectionObserver();
    const targetRef = makeTargetRef();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useViewportGate(targetRef, enabled),
      { initialProps: { enabled: false } }
    );

    expect(result.current).toBe(true);

    // The consumer already booted on this gate — flipping to lazy afterwards
    // must not close it (and must not start observing).
    rerender({ enabled: true });
    expect(result.current).toBe(true);
    expect(observerConstructor).not.toHaveBeenCalled();
  });
});
