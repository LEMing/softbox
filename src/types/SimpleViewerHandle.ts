import * as THREE from 'three';
import { ControlsInstance } from './CommonTypes';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from '../events/ViewerEvents';
import { CaptureStillOptions } from './CaptureStillOptions';

export type { CaptureStillOptions };

/**
 * Imperative handle exposed via `ref` on the `SimpleViewer` component. Lives in a
 * dedicated type module (not the component file) so cross-cutting modules such as
 * `events/ViewerEvents` can reference it without depending on a React component.
 */
export interface SimpleViewerHandle {
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: ControlsInstance | null;
  events: TypedEventEmitter<ViewerEventMap>;
  loadModel: (source: string | THREE.Object3D) => Promise<void>;
  /**
   * Capture a PNG still of the current scene (data URL). Pass `width`/`height`
   * for a high-resolution raster capture; in path-traced mode omit them — the
   * still is taken at canvas resolution once the accumulation completes.
   */
  captureStill: (options?: CaptureStillOptions) => Promise<string>;
  dispose: () => void;
}
