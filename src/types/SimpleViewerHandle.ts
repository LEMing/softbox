import * as THREE from 'three';
import { ControlsInstance } from './CommonTypes';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from '../events/ViewerEvents';

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
  dispose: () => void;
}
