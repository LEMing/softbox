import { Result } from '../../utils/Result';
import { IScene } from '../interfaces/IScene';
import { IObject3D } from '../interfaces/IObject3D';
import { ICamera } from '../interfaces/ICamera';
import { IControls } from '../interfaces/IControls';
import { IRenderer } from '../interfaces/IRenderer';

export type ContactShadowMode = 'baked' | 'live';

export interface ISceneSetupService {
  addHelpers(scene: IScene, options: IHelperOptions): Result<void>;
  
  addLighting(scene: IScene, options: ILightingOptions): Result<void>;
  
  createGradientBackground(scene: IScene, options: IGradientOptions): Result<void>;
  
  fitCameraToObject(object: IObject3D, camera: ICamera, controls: IControls): Result<void>;
  
  addDynamicGrid(scene: IScene, object: IObject3D, scaleFactor?: number): Result<void>;

  snapObjectToFloor(scene: IScene, object: IObject3D): Result<void>;

  fitShadowCameraToObject(scene: IScene, object: IObject3D): Result<void>;

  bakeContactShadow(scene: IScene, object: IObject3D, renderer: IRenderer): Result<void>;

  resetContactShadow(scene: IScene): Result<void>;

  setContactShadowMode(scene: IScene, mode: ContactShadowMode): Result<void>;

  wrapInUnitsScaleGroup(object: IObject3D, scaleToMeters: number): Result<IObject3D>;

  applyMaterialVariant(model: IObject3D, variant: string | null): Promise<Result<boolean>>;
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