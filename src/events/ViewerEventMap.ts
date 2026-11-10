import { ThreeViewerError } from '../errors';
import { Vec3Like } from '../types/Vec3Like';

export interface ViewerEventMap<TObject, TCamera, TControls, THandle> {
  'initialized': { viewer: THandle };
  'disposed': { viewer: THandle };

  'model:loading': { url: string };
  'model:progress': { url: string; loaded: number; total: number };
  'model:loaded': { model: TObject; loadTime: number };
  'model:error': { error: ThreeViewerError; url?: string };

  'render:start': { frame: number };
  'render:complete': { frame: number; renderTime: number; samples?: number };
  'pathtracing:complete': { samples: number; totalTime: number };
  'screenshot:captured': { dataUrl: string };

  'controls:change': { type?: string; camera?: TCamera; controls?: TControls };
  'object:selected': { object: TObject; point: Vec3Like };

  'error': { error: ThreeViewerError };
}
