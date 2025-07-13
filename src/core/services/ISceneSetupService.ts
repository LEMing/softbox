import { Result } from '../../utils/Result';
import { IScene } from '../interfaces/IScene';
import { IObject3D } from '../interfaces/IObject3D';
import { ICamera } from '../interfaces/ICamera';
import { IControls } from '../interfaces/IControls';

/**
 * Service for setting up scene elements like helpers, lighting, and backgrounds
 */
export interface ISceneSetupService {
  /**
   * Add helper objects to the scene
   */
  addHelpers(scene: IScene, options: IHelperOptions): Result<void>;
  
  /**
   * Add lighting to the scene
   */
  addLighting(scene: IScene, options: ILightingOptions): Result<void>;
  
  /**
   * Create gradient background
   */
  createGradientBackground(scene: IScene, options: IGradientOptions): Result<void>;
  
  /**
   * Fit camera to object
   */
  fitCameraToObject(object: IObject3D, camera: ICamera, controls: IControls): Result<void>;
  
  /**
   * Add dynamic grid based on object size
   */
  addDynamicGrid(scene: IScene, object: IObject3D, scaleFactor?: number): Result<void>;
}

export interface IHelperOptions {
  grid?: boolean;
  gridSize?: number;
  gridDivisions?: number;
  gridColor?: string;
  gridCenterLineColor?: string;
  axes?: boolean;
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
      radius?: number;
    };
  };
}

export interface IGradientOptions {
  topColor: string;
  bottomColor: string;
  offset?: number;
  exponent?: number;
}