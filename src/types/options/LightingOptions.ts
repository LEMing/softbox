import { Vec3Like } from '../../core/interfaces/Vec3Like';

export interface AmbientLightOptions {
  color?: string | number;
  intensity?: number;
}

export interface HemisphereLightOptions {
  skyColor?: string | number;
  groundColor?: string | number;
  intensity?: number;
}

export interface DirectionalLightOptions {
  color?: string | number;
  intensity?: number;
  position?: Vec3Like | [number, number, number];
  castShadow?: boolean;
  shadow?: {
    mapSize?: {
      width: number;
      height: number;
    };
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
}

export interface LightingOptions {
  ambientLight?: AmbientLightOptions;
  hemisphereLight?: HemisphereLightOptions;
  directionalLight?: DirectionalLightOptions;
}