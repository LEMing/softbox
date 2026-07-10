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
  /** Opt-in soft glow on bright highlights (UnrealBloom). */
  bloom?: boolean;
  /** Opt-in edge darkening that focuses attention on the subject. */
  vignette?: boolean;
  /** Opt-in subtle photographic film grain. */
  filmGrain?: boolean;
  /**
   * Opt-in contrast + saturation grade applied after tone mapping — adds punch
   * (a more "hero" read) while keeping the tone-mapping operator's hue. Pass
   * `true` for a balanced default, or an object to tune each amount (roughly
   * `-1..1`, `0` = no change). Off by default.
   */
  colorGrade?: boolean | { contrast?: number; saturation?: number };
  // NOTE: all three route the raster view through a post-processing composer
  // (lazy-loaded on first use — no cost or bundle weight if unused), so they
  // add a per-frame pass while the scene renders; leave them off for the
  // lazy-loading many-viewers grid. All are ignored while path tracing is
  // active (the tracer writes to the canvas directly).
}
