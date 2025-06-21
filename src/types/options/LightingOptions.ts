import * as THREE from 'three';

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
  position?: THREE.Vector3 | [number, number, number];
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