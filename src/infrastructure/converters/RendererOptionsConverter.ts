import * as THREE from 'three';
import { IRendererOptions } from '../../core/interfaces/IRenderer';
import { RendererOptions } from '../../types/options/RendererOptions';

export type ToneMappingName = 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces' | 'agx' | 'neutral';

/**
 * The single name<->constant tone-mapping table; the inverse is derived so
 * adding an operator is one edit, not three. NOTE: three renumbered the enum
 * in r160+ (AgX/Neutral) — always map through the constants, never numbers.
 */
export const TONE_MAPPING_BY_NAME: Record<ToneMappingName, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  // Khronos PBR Neutral: rolls highlights off filmically while preserving
  // material hue/saturation (unlike ACES, which desaturates bright values
  // toward white) — the default for this product viewer.
  neutral: THREE.NeutralToneMapping,
};

const TONE_MAPPING_NAMES = new Map<THREE.ToneMapping, ToneMappingName>(
  (Object.entries(TONE_MAPPING_BY_NAME) as Array<[ToneMappingName, THREE.ToneMapping]>).map(
    ([name, constant]) => [constant, name]
  )
);

export class RendererOptionsConverter {
  static convertRendererOptions(options: RendererOptions): IRendererOptions {
    const converted: IRendererOptions = {
      antialias: options.antialias,
      alpha: options.alpha,
      premultipliedAlpha: options.premultipliedAlpha,
      preserveDrawingBuffer: options.preserveDrawingBuffer,
      powerPreference: options.powerPreference,
      pixelRatio: options.pixelRatio,
    };

    // Convert shadow map
    if (options.shadowMapEnabled !== undefined || options.shadowMapType !== undefined) {
      converted.shadowMap = {
        enabled: options.shadowMapEnabled ?? true,
        type: this.convertShadowMapType(options.shadowMapType),
      };
    }

    // Convert tone mapping
    if (options.toneMapping !== undefined || options.toneMappingExposure !== undefined) {
      converted.toneMapping = {
        type: this.convertToneMappingType(options.toneMapping),
        exposure: options.toneMappingExposure ?? 1,
      };
    }

    // Opt-in post-processing effects — only carried through when at least one
    // is set, so a plain viewer has no `postProcessing` block at all.
    const bloom = options.bloom;
    const vignette = options.vignette;
    const filmGrain = options.filmGrain;
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

  /**
   * Resolve the `boolean | {contrast?, saturation?}` option to concrete
   * amounts. Shared by the construction-time conversion above and the runtime
   * post-effect toggle (`ThreeRendererAdapter.setPostProcessing`).
   */
  static resolveColorGrade(
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

  private static convertToneMappingType(type: unknown): ToneMappingName {
    if (typeof type === 'number') {
      const name = TONE_MAPPING_NAMES.get(type as THREE.ToneMapping);
      if (name) {
        return name;
      }
    }
    return (typeof type === 'string' ? type : 'neutral') as ToneMappingName;
  }
}