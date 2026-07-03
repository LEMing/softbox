import { useMemo, useRef } from 'react';
import { ViewerCore } from '../../core/ViewerCore';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { ViewerEventMap } from '../../events/ViewerEvents';
import { ViewerEventMap as CoreViewerEventMap } from '../../core/events/CoreViewerEvents';
import { EventAdapter } from '../adapters/EventAdapter';
import { useViewerEventHandlers } from './useViewerEvents';

/**
 * Bridges the engine-agnostic core event bus to the public, THREE-typed one
 * exposed on the imperative handle. Core payloads carrying adapters are
 * converted (model/controls/object:selected); the rest pass through. Returns
 * the stable public emitter for the handle.
 */
export function useForwardedEvents(
  viewer: ViewerCore | null
): TypedEventEmitter<ViewerEventMap> {
  const eventsRef = useRef<TypedEventEmitter<ViewerEventMap>>(new TypedEventEmitter());

  const handlers = useMemo(
    () => ({
      'model:loading': (data: CoreViewerEventMap['model:loading']) =>
        eventsRef.current.emit('model:loading', data),
      'model:loaded': (data: CoreViewerEventMap['model:loaded']) =>
        eventsRef.current.emit('model:loaded', EventAdapter.convertModelLoaded(data)),
      'model:error': (data: CoreViewerEventMap['model:error']) =>
        eventsRef.current.emit('model:error', data),
      'render:complete': (data: CoreViewerEventMap['render:complete']) =>
        eventsRef.current.emit('render:complete', data),
      'controls:change': (data: CoreViewerEventMap['controls:change']) =>
        eventsRef.current.emit('controls:change', EventAdapter.convertControlsChange(data)),
      'object:selected': (data: CoreViewerEventMap['object:selected']) =>
        eventsRef.current.emit('object:selected', EventAdapter.convertObjectSelected(data)),
      'error': (data: CoreViewerEventMap['error']) =>
        eventsRef.current.emit('error', data),
    }),
    [] // eventsRef is stable
  );

  useViewerEventHandlers(viewer, handlers);

  return eventsRef.current;
}
