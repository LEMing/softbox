import * as THREE from 'three';
import { ControlsInstance } from './CommonTypes';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from '../events/ViewerEvents';
import { CaptureStillOptions } from './CaptureStillOptions';
import { CaptureVideoOptions } from './CaptureVideoOptions';

export type { CaptureStillOptions, CaptureVideoOptions };

export interface SimpleViewerHandle {
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: ControlsInstance | null;
  events: TypedEventEmitter<ViewerEventMap>;
  loadModel: (source: string | THREE.Object3D) => Promise<void>;
  captureStill: (options?: CaptureStillOptions) => Promise<string>;
  captureVideo: (options?: CaptureVideoOptions) => Promise<Blob>;
  getAnimationNames: () => string[];
  getVariantNames: () => string[];
  setVariant: (variant: string | null) => void;
  playAnimations: (clipName?: string) => void;
  pauseAnimations: () => void;
  setEnvironmentMap: (url: string) => Promise<void>;
  resetEnvironment: () => void;
  setBackgroundImage: (source: string | File | HTMLImageElement) => Promise<void>;
  setBackgroundColor: (color: string | number) => void;
  dispose: () => void;
}
