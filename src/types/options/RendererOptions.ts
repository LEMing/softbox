export interface RendererOptions {
  antialias?: boolean;
  alpha?: boolean;
  premultipliedAlpha?: boolean;
  preserveDrawingBuffer?: boolean;
  powerPreference?: 'high-performance' | 'low-power' | 'default';
  shadowMapEnabled?: boolean;
  pixelRatio?: number;
  shadowMapType?: number;
  toneMapping?: number;
  toneMappingExposure?: number;
  outputColorSpace?: string;
  bloom?: boolean;
  vignette?: boolean;
  filmGrain?: boolean;
  colorGrade?: boolean | { contrast?: number; saturation?: number };
}
