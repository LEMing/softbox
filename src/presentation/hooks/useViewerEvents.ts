import { useEffect, useRef } from 'react';
import { ViewerCore } from '../../core/ViewerCore';
import { ViewerEventMap } from '../../core/events/ViewerEvents';

/**
 * Hook to subscribe to viewer events
 */
export function useViewerEvents<K extends keyof ViewerEventMap>(
  viewer: ViewerCore | null,
  event: K,
  handler: (data: ViewerEventMap[K]) => void
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const events = viewer.getEvents();
    const wrappedHandler = (data: ViewerEventMap[K]) => {
      handlerRef.current(data);
    };

    events.on(event, wrappedHandler);

    return () => {
      events.off(event, wrappedHandler);
    };
  }, [viewer, event]);
}

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

    // Subscribe to all provided handlers
    (Object.keys(handlers) as Array<keyof ViewerEventMap>).forEach((event) => {
      const handler = handlers[event];
      if (handler) {
        const wrappedHandler = (data: unknown) => {
          const currentHandler = handlersRef.current[event];
          if (currentHandler) {
            currentHandler(data as never);
          }
        };
        
        events.on(event, wrappedHandler as never);
        cleanupFunctions.push(() => events.off(event, wrappedHandler as never));
      }
    });

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, [viewer]); // Only depend on viewer, handlers are accessed via ref
}