export interface RendererOptions {
  antialias?: boolean;
  alpha?: boolean;
  shadowMapEnabled?: boolean;
  pixelRatio?: number;
  /** A `THREE.ShadowMapType` constant (e.g. `THREE.PCFShadowMap` === 1). */
  shadowMapType?: number;
  /** A `THREE.ToneMapping` constant (e.g. `THREE.ACESFilmicToneMapping` === 6). */
  toneMapping?: number;
  toneMappingExposure?: number;
  /** A `THREE.ColorSpace` value (e.g. `'srgb'`, `'srgb-linear'`). */
  outputColorSpace?: string;
}
