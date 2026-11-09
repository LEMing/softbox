import * as THREE from 'three';
import { ViewerRendererOptions } from '../../core/rendering/ViewerRenderer';
import { resolveColorGrade } from '../../core/rendering/colorGrade';
import { RendererOptions } from '../../types/options/RendererOptions';

const TONE_MAPPING_BY_NAME = new Map<string, THREE.ToneMapping>([
  ['none', THREE.NoToneMapping],
  ['linear', THREE.LinearToneMapping],
  ['reinhard', THREE.ReinhardToneMapping],
  ['cineon', THREE.CineonToneMapping],
  ['aces', THREE.ACESFilmicToneMapping],
  ['agx', THREE.AgXToneMapping],
  ['neutral', THREE.NeutralToneMapping],
]);

const SHADOW_MAP_TYPE_BY_NAME = new Map<string, THREE.ShadowMapType>([
  ['basic', THREE.BasicShadowMap],
  ['pcf', THREE.PCFShadowMap],
  ['pcfsoft', THREE.PCFShadowMap],
  ['vsm', THREE.VSMShadowMap],
]);

const SHADOW_MAP_TYPE_BY_CONSTANT = new Map<number, THREE.ShadowMapType>([
  [THREE.BasicShadowMap, THREE.BasicShadowMap],
  [THREE.PCFShadowMap, THREE.PCFShadowMap],
  [THREE.PCFSoftShadowMap, THREE.PCFShadowMap],
  [THREE.VSMShadowMap, THREE.VSMShadowMap],
]);

const SUPPORTED_TONE_MAPPINGS = new Set<number>(TONE_MAPPING_BY_NAME.values());

export class RendererOptionsConverter {
  static convertRendererOptions(options: RendererOptions): ViewerRendererOptions {
    const converted: ViewerRendererOptions = {
      antialias: options.antialias,
      alpha: options.alpha,
      premultipliedAlpha: options.premultipliedAlpha,
      preserveDrawingBuffer: options.preserveDrawingBuffer,
      powerPreference: options.powerPreference,
      pixelRatio: options.pixelRatio,
    };

    if (options.shadowMapEnabled !== undefined || options.shadowMapType !== undefined) {
      converted.shadowMap = {
        enabled: options.shadowMapEnabled ?? true,
        type: this.convertShadowMapType(options.shadowMapType),
      };
    }

    if (options.toneMapping !== undefined || options.toneMappingExposure !== undefined) {
      converted.toneMapping = {
        type: this.convertToneMapping(options.toneMapping),
        exposure: options.toneMappingExposure ?? 1,
      };
    }

    const bloom = options.bloom;
    const vignette = options.vignette;
    const filmGrain = options.filmGrain;
    const colorGrade = resolveColorGrade(options.colorGrade);
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

  private static convertShadowMapType(type: unknown): THREE.ShadowMapType | undefined {
    if (typeof type === 'number') {
      return SHADOW_MAP_TYPE_BY_CONSTANT.get(type);
    }
    if (typeof type === 'string') {
      return SHADOW_MAP_TYPE_BY_NAME.get(type);
    }
    return undefined;
  }

  private static convertToneMapping(type: unknown): THREE.ToneMapping {
    if (typeof type === 'number' && SUPPORTED_TONE_MAPPINGS.has(type)) {
      return type as THREE.ToneMapping;
    }
    if (typeof type === 'string') {
      return TONE_MAPPING_BY_NAME.get(type) ?? THREE.NeutralToneMapping;
    }
    return THREE.NeutralToneMapping;
  }
}
