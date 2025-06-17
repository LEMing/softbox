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
  
  // Refs for external control
  refs?: Partial<ThreeJSRefs>;
  
  // Callbacks
  onLoad?: () => void;
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  animationLoop?: ((time: number) => void) | null;
  
  // Special features
  replaceWithScreenshotOnComplete?: boolean;
  
  // Legacy support - will be removed in v2.0
  /** @deprecated Use pathTracing.enabled instead */
  usePathTracing?: boolean;
  /** @deprecated Use pathTracing.maxSamples instead */
  maxSamplesPathTracing?: number;
  /** @deprecated Use pathTracing options instead */
  pathTracingSettings?: {
    bounces?: number;
    transmissiveBounces?: number;
    lowResScale?: number;
    renderScale?: number;
    enablePathTracing?: boolean;
    dynamicLowRes?: boolean;
  };
  /** @deprecated Use environment.url instead */
  envMapUrl?: string;
  /** @deprecated Use lighting instead of lightning (typo fix) */
  lightning?: LightingOptions;
  /** @deprecated Use refs instead */
  threeBaseRefs?: {
    scene: {current: THREE.Scene | null};
    camera: {current: THREE.Camera | null};
    renderer: {current: THREE.WebGLRenderer | null};
    controls: {current: OrbitControls | MapControls | null};
    mountPoint: {current: HTMLDivElement | null}
  };
}