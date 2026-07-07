import { useEffect, useMemo, useRef } from 'react';
import { ViewerCore } from '../../core/ViewerCore';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { ViewerEventMap } from '../../core/events/CoreViewerEvents';
import { useViewerEventHandlers } from './useViewerEvents';

/**
 * Invokes the consumer's `options.onLoad` / `options.onProgress` /
 * `options.onError` callbacks from the viewer's lifecycle. The callbacks are
 * read through a ref: identity churn on the options object neither rebuilds
 * the viewer (they are excluded from the structural key) nor pins stale
 * closures.
 */
export function useOptionCallbacks(
  viewer: ViewerCore | null,
  initError: Error | null,
  options: SimpleViewerOptions
): void {
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const handlers = useMemo(
    () => ({
      'model:loaded': () => callbacksRef.current.onLoad?.(),
      'model:progress': (data: ViewerEventMap['model:progress']) =>
        callbacksRef.current.onProgress?.(data.loaded / data.total),
      'model:error': (data: ViewerEventMap['model:error']) =>
        callbacksRef.current.onError?.(data.error),
    }),
    [] // callbacksRef is stable
  );
  useViewerEventHandlers(viewer, handlers);

  // Construction/initialization failures never reach the event bus — the
  // emitter may not exist yet when they happen — so surface them here.
  useEffect(() => {
    if (initError) {
      callbacksRef.current.onError?.(initError);
    }
  }, [initError]);
}
