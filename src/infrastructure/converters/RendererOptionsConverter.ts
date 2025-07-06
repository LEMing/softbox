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

    return converted;
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

  private static convertToneMappingType(type: unknown): 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces' {
    if (typeof type === 'number') {
      // Map THREE constants to string values
      if (type === THREE.NoToneMapping) return 'none';
      if (type === THREE.LinearToneMapping) return 'linear';
      if (type === THREE.ReinhardToneMapping) return 'reinhard';
      if (type === THREE.CineonToneMapping) return 'cineon';
      if (type === THREE.ACESFilmicToneMapping) return 'aces';
    }
    return (typeof type === 'string' ? type : 'aces') as 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces';
  }
}