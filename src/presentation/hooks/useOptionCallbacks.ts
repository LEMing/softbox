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
      // Clamped: three's FileLoader counts DECOMPRESSED bytes against a
      // Content-Length that is the compressed size, so loaded/total can
      // exceed 1 on gzip/brotli transfers.
      'model:progress': (data: ViewerEventMap['model:progress']) =>
        callbacksRef.current.onProgress?.(Math.min(1, data.loaded / data.total)),
      'model:error': (data: ViewerEventMap['model:error']) =>
        callbacksRef.current.onError?.(data.error),
    }),
    [] // callbacksRef is stable
  );
  useViewerEventHandlers(viewer, handlers);

  // Construction/initialization failures never reach the event bus — the
  // emitter may not exist yet when they happen — so surface them here. Runs
  // after every render (guarded to fire once per failure) so a callback
  // attached on a LATER render than the failure still hears about it.
  const reportedInitErrorRef = useRef<Error | null>(null);
  useEffect(() => {
    if (!initError) {
      reportedInitErrorRef.current = null;
      return;
    }
    const onError = callbacksRef.current.onError;
    if (onError && reportedInitErrorRef.current !== initError) {
      reportedInitErrorRef.current = initError;
      onError(initError);
    }
  });
}
