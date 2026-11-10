import { useMemo, useRef } from 'react';
import { ViewerCore } from '../../core/ViewerCore';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { ViewerEventMap } from '../../events/ViewerEvents';
import { ViewerEventMap as CoreViewerEventMap } from '../../core/events/CoreViewerEvents';
import { useViewerEventHandlers } from './useViewerEvents';

export function useForwardedEvents(
  viewer: ViewerCore | null
): TypedEventEmitter<ViewerEventMap> {
  const eventsRef = useRef<TypedEventEmitter<ViewerEventMap>>(new TypedEventEmitter());

  const handlers = useMemo(
    () => ({
      'model:loading': (data: CoreViewerEventMap['model:loading']) =>
        eventsRef.current.emit('model:loading', data),
      'model:progress': (data: CoreViewerEventMap['model:progress']) =>
        eventsRef.current.emit('model:progress', data),
      'model:loaded': (data: CoreViewerEventMap['model:loaded']) =>
        eventsRef.current.emit('model:loaded', data),
      'model:error': (data: CoreViewerEventMap['model:error']) =>
        eventsRef.current.emit('model:error', data),
      'render:complete': (data: CoreViewerEventMap['render:complete']) =>
        eventsRef.current.emit('render:complete', data),
      'controls:change': (data: CoreViewerEventMap['controls:change']) =>
        eventsRef.current.emit('controls:change', data),
      'object:selected': (data: CoreViewerEventMap['object:selected']) =>
        eventsRef.current.emit('object:selected', data),
      'error': (data: CoreViewerEventMap['error']) =>
        eventsRef.current.emit('error', data),
    }),
    []
  );

  useViewerEventHandlers(viewer, handlers);

  return eventsRef.current;
}
