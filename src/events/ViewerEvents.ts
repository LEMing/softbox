import { ThreeViewerError } from '../errors';
import * as THREE from 'three';
import { ControlsInstance } from '../types/CommonTypes';
import type { SimpleViewerHandle } from '../SimpleViewerWrapper';

export interface ViewerEventMap {
  // Lifecycle events
  'initialized': { viewer: SimpleViewerHandle };
  'disposed': { viewer: SimpleViewerHandle };
  
  // Loading events
  'model:loading': { url: string };
  'model:loaded': { model: THREE.Object3D; loadTime: number };
  'model:error': { error: ThreeViewerError; url?: string };
  
  // Rendering events
  'render:start': { frame: number };
  'render:complete': { frame: number; renderTime: number; samples?: number };
  'pathtracing:complete': { samples: number; totalTime: number };
  'screenshot:captured': { dataUrl: string };
  
  // Interaction events
  'controls:change': { type?: string; camera?: THREE.Camera; controls?: ControlsInstance };
  'object:selected': { object: THREE.Object3D };
  
  // Error events
  'error': { error: ThreeViewerError };
}