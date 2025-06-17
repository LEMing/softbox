import * as THREE from 'three';

export interface RendererOptions {
  antialias?: boolean;
  alpha?: boolean;
  shadowMapEnabled?: boolean;
  pixelRatio?: number;
  shadowMapType?: THREE.ShadowMapType;
  toneMapping?: THREE.ToneMapping;
  toneMappingExposure?: number;
  outputColorSpace?: THREE.ColorSpace;
}