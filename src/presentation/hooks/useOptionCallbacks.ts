import { useEffect, useMemo, useRef } from 'react';
import { ViewerCore } from '../../core/ViewerCore';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { ViewerEventMap } from '../../core/events/CoreViewerEvents';
import { useViewerEventHandlers } from './useViewerEvents';

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
        callbacksRef.current.onProgress?.(Math.min(1, data.loaded / data.total)),
      'model:error': (data: ViewerEventMap['model:error']) =>
        callbacksRef.current.onError?.(data.error),
    }),
    []
  );
  useViewerEventHandlers(viewer, handlers);

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
