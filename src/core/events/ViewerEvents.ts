import { ThreeViewerError } from '../../errors';
import { IObject3D } from '../interfaces/IObject3D';
import { ICamera } from '../interfaces/ICamera';
import { IControls } from '../interfaces/IControls';

export interface ViewerEventMap {
  // Lifecycle events
  'initialized': { viewer: unknown }; // Viewer handle is presentation-specific
  'disposed': { viewer: unknown };
  
  // Loading events
  'model:loading': { url: string };
  'model:loaded': { model: IObject3D; loadTime: number };
  'model:error': { error: ThreeViewerError; url?: string };
  
  // Rendering events
  'render:start': { frame: number };
  'render:complete': { frame: number; renderTime: number; samples?: number };
  'pathtracing:complete': { samples: number; totalTime: number };
  'screenshot:captured': { dataUrl: string };
  
  // Interaction events
  'controls:change': { type?: string; camera?: ICamera; controls?: IControls };
  'object:selected': { object: IObject3D };
  
  // Error events
  'error': { error: ThreeViewerError };
}