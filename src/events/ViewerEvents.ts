import { ThreeViewerError } from '../errors';
import * as THREE from 'three';
import type { SimpleViewerHandle } from '../SimpleViewer';

export interface ViewerEventMap {
  // Lifecycle events
  'initialized': { viewer: SimpleViewerHandle };
  'disposed': { viewer: SimpleViewerHandle };
  
  // Loading events
  'model:loading': { url: string };
  'model:loaded': { model: THREE.Object3D; loadTime: number };
  'model:error': { error: ThreeViewerError; url: string };
  
  // Rendering events
  'render:start': { frame: number };
  'render:complete': { frame: number; renderTime: number };
  'screenshot:captured': { dataUrl: string };
  
  // Interaction events
  'controls:change': { type: string; camera: THREE.Camera };
  'object:selected': { object: THREE.Object3D };
  
  // Error events
  'error': { error: ThreeViewerError };
}