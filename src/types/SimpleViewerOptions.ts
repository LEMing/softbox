import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {
  CameraOptions,
  ControlsOptions,
  EnvironmentOptions,
  HelperOptions,
  LightingOptions,
  PathTracingOptions,
  RendererOptions,
  RenderingOptions,
} from './options';

export interface ThreeJSRefs {
  scene: React.RefObject<THREE.Scene>;
  camera: React.RefObject<THREE.Camera>;
  renderer: React.RefObject<THREE.WebGLRenderer>;
  controls: React.RefObject<OrbitControls | MapControls>;
  mountPoint: React.RefObject<HTMLDivElement>;
}

export interface SimpleViewerOptions {
  // Scene settings
  backgroundColor?: string | number;
  staticScene?: boolean;
  
  // Component options
  camera?: CameraOptions;
  controls?: ControlsOptions;
  environment?: EnvironmentOptions;
  helpers?: HelperOptions;
  lighting?: LightingOptions;
  pathTracing?: PathTracingOptions;
  renderer?: RendererOptions;
  rendering?: RenderingOptions;
  
  // Refs for external control
  refs?: Partial<ThreeJSRefs>;
  
  // Callbacks
  onLoad?: () => void;
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  animationLoop?: ((time: number) => void) | null;
  
  // Special features
  replaceWithScreenshotOnComplete?: boolean;
}