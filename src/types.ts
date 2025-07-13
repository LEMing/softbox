import * as THREE from 'three';
import type { SimpleViewerOptions as ViewerOptions } from './types/SimpleViewerOptions';
import { GLTFLoadCallback } from './types/CommonTypes';

// Re-export all types from the new modular structure
export * from './types/options';
export { SimpleViewerOptions, ThreeJSRefs } from './types/SimpleViewerOptions';

// Export SimpleViewerHandle from SimpleViewerWrapper
export type { SimpleViewerHandle } from './SimpleViewerWrapper';

export type LoaderGLB = {
  load: (
    url: string,
    onLoad?: GLTFLoadCallback,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (event: ErrorEvent) => void) => void;
}

export interface SimpleViewerProps {
  object: THREE.Object3D | null | string; // Pass a Three.js object or an url to a glb file
  options?: ViewerOptions;
}

