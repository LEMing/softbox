import * as THREE from 'three';
import type { SimpleViewerOptions as ViewerOptions } from './types/SimpleViewerOptions';

// Re-export all types from the new modular structure
export * from './types/options';
export { SimpleViewerOptions } from './types/SimpleViewerOptions';

// Export SimpleViewerHandle from its dedicated type module
export type { SimpleViewerHandle } from './types/SimpleViewerHandle';

export interface SimpleViewerProps {
  object: THREE.Object3D | null | string; // Pass a Three.js object or an url to a glb file
  options?: ViewerOptions;
}

