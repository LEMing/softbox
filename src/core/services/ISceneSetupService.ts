import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Result } from '../../utils/Result';

export type ContactShadowMode = 'baked' | 'live';

export interface ISceneSetupService {
  addHelpers(scene: THREE.Scene, options: IHelperOptions): Result<void>;
  
  addLighting(scene: THREE.Scene, options: ILightingOptions): Result<void>;
  
  createGradientBackground(scene: THREE.Scene, options: IGradientOptions): Result<void>;
  
  fitCameraToObject(object: THREE.Object3D, camera: THREE.PerspectiveCamera, controls: OrbitControls): Result<void>;
  
  addDynamicGrid(scene: THREE.Scene, object: THREE.Object3D, scaleFactor?: number): Result<void>;

  snapObjectToFloor(scene: THREE.Scene, object: THREE.Object3D): Result<void>;

  fitShadowCameraToObject(scene: THREE.Scene, object: THREE.Object3D): Result<void>;

  bakeContactShadow(scene: THREE.Scene, object: THREE.Object3D, renderer: THREE.WebGLRenderer | null): Result<void>;

  resetContactShadow(scene: THREE.Scene): Result<void>;

  setContactShadowMode(scene: THREE.Scene, mode: ContactShadowMode): Result<void>;

  wrapInUnitsScaleGroup(object: THREE.Object3D, scaleToMeters: number): Result<THREE.Object3D>;

  applyMaterialVariant(model: THREE.Object3D, variant: string | null): Promise<Result<boolean>>;
}

import { GridHelperOptions, AxesHelperOptions } from '../../types/options/HelperOptions';

export interface IHelperOptions {
  grid?: boolean | GridHelperOptions;
  gridSize?: number;
  gridDivisions?: number;
  gridColor?: string;
  gridCenterLineColor?: string;
  axes?: boolean | AxesHelperOptions;
  axesSize?: number;
  object3DHelper?: boolean;
}

export interface ILightingOptions {
  ambient?: {
    color?: string;
    intensity?: number;
  };
  hemisphere?: {
    skyColor?: string;
    groundColor?: string;
    intensity?: number;
  };
  directional?: {
    color?: string;
    intensity?: number;
    position?: [number, number, number];
    castShadow?: boolean;
    shadow?: {
      mapSize?: { width: number; height: number };
      camera?: {
        near?: number;
        far?: number;
        left?: number;
        right?: number;
        top?: number;
        bottom?: number;
      };
      bias?: number;
      normalBias?: number;
      radius?: number;
    };
  };
  fill?: {
    color?: string;
    intensity?: number;
    position?: [number, number, number];
  };
  rim?: {
    color?: string;
    intensity?: number;
    position?: [number, number, number];
  };
}

export interface IGradientOptions {
  topColor: string;
  bottomColor: string;
  offset?: number;
  exponent?: number;
  radial?: boolean;
}