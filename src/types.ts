import * as THREE from 'three';
import type { SimpleViewerOptions as ViewerOptions } from './types/SimpleViewerOptions';
import type { ViewerPreset } from './types/options';

// Re-export all types from the new modular structure
export * from './types/options';
export { SimpleViewerOptions } from './types/SimpleViewerOptions';

// Export SimpleViewerHandle from its dedicated type module
export type { SimpleViewerHandle } from './types/SimpleViewerHandle';

export interface SimpleViewerProps {
  object: THREE.Object3D | null | string; // Pass a Three.js object or an url to a glb file
  options?: ViewerOptions;
  /**
   * Shorthand for `options.preset` — a one-word look
   * (`studio` / `product` / `neutral` / `dark` / `outdoor`).
   * `options.preset` takes precedence if both are set.
   */
  preset?: ViewerPreset;
  /**
   * Shorthand for `options.pathTracing.enabled = true` — photoreal progressive
   * path tracing (a construction-time render mode). Composes with a partial
   * `options.pathTracing` (tuning fields are kept); an explicit
   * `options.pathTracing.enabled` wins. Pair with `handle.captureStill()` for
   * a photoreal still once the accumulation completes.
   */
  pathTraced?: boolean;
}

