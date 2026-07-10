import * as THREE from 'three';
import { IRendererOptions } from '../../core/interfaces/IRenderer';

export class RendererOptionsConverter {
  static convertRendererOptions(options: Record<string, unknown>): IRendererOptions {
    const converted: IRendererOptions = {
      antialias: options.antialias as boolean | undefined,
      alpha: options.alpha as boolean | undefined,
      premultipliedAlpha: options.premultipliedAlpha as boolean | undefined,
      preserveDrawingBuffer: options.preserveDrawingBuffer as boolean | undefined,
      powerPreference: options.powerPreference as 'high-performance' | 'low-power' | 'default' | undefined,
      pixelRatio: options.pixelRatio as number | undefined,
    };

    // Convert shadow map
    if (options.shadowMapEnabled !== undefined || options.shadowMapType !== undefined) {
      converted.shadowMap = {
        enabled: (options.shadowMapEnabled ?? true) as boolean,
        type: this.convertShadowMapType(options.shadowMapType),
      };
    }

    // Convert tone mapping
    if (options.toneMapping !== undefined || options.toneMappingExposure !== undefined) {
      converted.toneMapping = {
        type: this.convertToneMappingType(options.toneMapping),
        exposure: (options.toneMappingExposure ?? 1) as number,
      };
    }

    // Opt-in post-processing effects — only carried through when at least one
    // is set, so a plain viewer has no `postProcessing` block at all.
    const bloom = options.bloom as boolean | undefined;
    const vignette = options.vignette as boolean | undefined;
    const filmGrain = options.filmGrain as boolean | undefined;
    const colorGrade = this.resolveColorGrade(options.colorGrade);
    if (bloom || vignette || filmGrain || colorGrade) {
      converted.postProcessing = {
        bloom: bloom ?? false,
        vignette: vignette ?? false,
        filmGrain: filmGrain ?? false,
        colorGrade,
      };
    }

    return converted;
  }

  /** Balanced default punch when `colorGrade: true` (roughly -1..1, 0 = none). */
  private static readonly DEFAULT_GRADE_CONTRAST = 0.12;
  private static readonly DEFAULT_GRADE_SATURATION = 0.15;

  /** Resolve the `boolean | {contrast?, saturation?}` option to concrete amounts. */
  private static resolveColorGrade(
    raw: unknown
  ): { contrast: number; saturation: number } | undefined {
    if (!raw) {
      return undefined;
    }
    if (raw === true) {
      return { contrast: this.DEFAULT_GRADE_CONTRAST, saturation: this.DEFAULT_GRADE_SATURATION };
    }
    if (typeof raw === 'object') {
      const grade = raw as { contrast?: number; saturation?: number };
      return {
        contrast: grade.contrast ?? this.DEFAULT_GRADE_CONTRAST,
        saturation: grade.saturation ?? this.DEFAULT_GRADE_SATURATION,
      };
    }
    return undefined;
  }

  private static convertShadowMapType(type: unknown): 'basic' | 'pcf' | 'pcfsoft' | 'vsm' | undefined {
    if (typeof type === 'number') {
      // Map THREE constants to string values
      if (type === THREE.BasicShadowMap) return 'basic';
      if (type === THREE.PCFShadowMap) return 'pcf';
      if (type === THREE.PCFSoftShadowMap) return 'pcfsoft';
      if (type === THREE.VSMShadowMap) return 'vsm';
    }
    return typeof type === 'string' ? type as 'basic' | 'pcf' | 'pcfsoft' | 'vsm' : undefined;
  }

  private static convertToneMappingType(
    type: unknown
  ): 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces' | 'agx' | 'neutral' {
    if (typeof type === 'number') {
      // Map THREE constants to string values. NOTE: the numeric enum was
      // renumbered in three r160+ (AgX/Neutral were added), so these must map
      // the actual constants, not hardcoded numbers — a stale number would
      // silently select the wrong operator via the fallback below.
      if (type === THREE.NoToneMapping) return 'none';
      if (type === THREE.LinearToneMapping) return 'linear';
      if (type === THREE.ReinhardToneMapping) return 'reinhard';
      if (type === THREE.CineonToneMapping) return 'cineon';
      if (type === THREE.ACESFilmicToneMapping) return 'aces';
      if (type === THREE.AgXToneMapping) return 'agx';
      if (type === THREE.NeutralToneMapping) return 'neutral';
    }
    return (typeof type === 'string' ? type : 'neutral') as
      | 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces' | 'agx' | 'neutral';
  }
}