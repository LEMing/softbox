import * as THREE from 'three';
import { ControlsInstance } from './CommonTypes';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from '../events/ViewerEvents';
import { CaptureStillOptions } from './CaptureStillOptions';
import { CaptureVideoOptions } from './CaptureVideoOptions';

export type { CaptureStillOptions, CaptureVideoOptions };

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
  /**
   * Record the live canvas for a few seconds (default 3) and resolve with the
   * encoded clip — WebM in Chromium/Firefox, MP4 in Safari. Motion (turntable,
   * animations, user orbiting) is captured as it happens.
   */
  captureVideo: (options?: CaptureVideoOptions) => Promise<Blob>;
  /** Clip names of the loaded model, in file order (empty when none). */
  getAnimationNames: () => string[];
  /**
   * Plays one clip by name, or ALL clips when no name is given (looped).
   * Throws `INVALID_PARAMETER` on a clip name the model does not carry.
   */
  playAnimations: (clipName?: string) => void;
  /** Freezes playback on the current pose; playAnimations() resumes. */
  pauseAnimations: () => void;
  /**
   * Replace the environment map (reflections + background) at runtime with the
   * equirectangular HDRI/LDR image at `url`. Cached by URL, so re-applying is cheap.
   */
  setEnvironmentMap: (url: string) => Promise<void>;
  /** Restore the built-in studio environment and clean gradient background. */
  resetEnvironment: () => void;
  /**
   * Paint an uploaded image (URL, File, or HTMLImageElement) as the scene backdrop
   * without changing the environment lighting. Clear it with setBackgroundColor.
   */
  setBackgroundImage: (source: string | File | HTMLImageElement) => Promise<void>;
  /** Set a solid background color (also clears a background image). */
  setBackgroundColor: (color: string | number) => void;
  dispose: () => void;
}
