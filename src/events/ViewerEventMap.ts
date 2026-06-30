import { ThreeViewerError } from '../errors';

/**
 * The viewer's event contract, generic over the layer-specific representations
 * of a 3D object, camera, controls, and viewer handle. The engine-agnostic core
 * instantiates it with its interfaces (`IObject3D`/`ICamera`/…); the public
 * surface instantiates it with the concrete Three.js types. Keeping a single
 * generic definition is what stops the two instantiations from drifting apart.
 */
export interface ViewerEventMap<TObject, TCamera, TControls, THandle> {
  // Lifecycle events
  'initialized': { viewer: THandle };
  'disposed': { viewer: THandle };

  // Loading events
  'model:loading': { url: string };
  'model:loaded': { model: TObject; loadTime: number };
  'model:error': { error: ThreeViewerError; url?: string };

  // Rendering events
  'render:start': { frame: number };
  'render:complete': { frame: number; renderTime: number; samples?: number };
  'pathtracing:complete': { samples: number; totalTime: number };
  'screenshot:captured': { dataUrl: string };

  // Interaction events
  'controls:change': { type?: string; camera?: TCamera; controls?: TControls };
  'object:selected': { object: TObject };

  // Error events
  'error': { error: ThreeViewerError };
}
