import { useEffect, useRef } from 'react';
import { ViewerCore } from '../../core/ViewerCore';
import { ViewerEventMap } from '../../core/events/CoreViewerEvents';

/**
 * Hook to subscribe to multiple viewer events
 */
export function useViewerEventHandlers(
  viewer: ViewerCore | null,
  handlers: Partial<{
    [K in keyof ViewerEventMap]: (data: ViewerEventMap[K]) => void;
  }>
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const events = viewer.getEvents();
    const cleanupFunctions: (() => void)[] = [];

    // One generically-typed subscription per provided handler; reading the
    // handler through the ref keeps the latest callback without resubscribing.
    const subscribe = <K extends keyof ViewerEventMap>(event: K): (() => void) => {
      const wrappedHandler = (data: ViewerEventMap[K]) => {
        handlersRef.current[event]?.(data);
      };
      events.on(event, wrappedHandler);
      return () => events.off(event, wrappedHandler);
    };

    (Object.keys(handlers) as Array<keyof ViewerEventMap>).forEach((event) => {
      if (handlers[event]) {
        cleanupFunctions.push(subscribe(event));
      }
    });

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers are read live via handlersRef; only `viewer` should re-subscribe. Callers pass a stable (memoized) handlers object.
  }, [viewer]);
}