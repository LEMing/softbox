import * as React from 'react';
import * as THREE from 'three';
import type { SimpleViewerOptions as ViewerOptions } from './types/SimpleViewerOptions';
import type { ViewerPreset } from './types/options';

// Re-export all types from the new modular structure
export * from './types/options';
export { SimpleViewerOptions } from './types/SimpleViewerOptions';

// Export SimpleViewerHandle from its dedicated type module
export type { SimpleViewerHandle } from './types/SimpleViewerHandle';

export interface SimpleViewerProps {
  /**
   * A URL to a glb/gltf file, or a Three.js object. The viewer takes
   * OWNERSHIP of objects you pass: their geometries, materials and textures
   * are disposed when the object is replaced or the viewer unmounts. Pass a
   * `.clone()` if you need to keep using the original elsewhere.
   */
  object: THREE.Object3D | null | string;
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
  /**
   * Shorthand for `options.controls.autoRotate = true` — a showcase turntable
   * that slowly orbits the camera around the model. Toggling it never rebuilds
   * the viewer (applied live), and rotation pauses automatically while the
   * user is dragging. Speed is tuned via `options.controls.autoRotateSpeed`
   * (2 ≈ one orbit per 30s). An explicit `options.controls.autoRotate` wins.
   */
  turntable?: boolean;
  /**
   * Overlay children rendered inside the viewer container (over the canvas),
   * e.g. `<Hotspot>` annotations.
   */
  children?: React.ReactNode;
}

