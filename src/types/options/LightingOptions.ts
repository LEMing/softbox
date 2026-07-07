import { Vec3Like } from '../../core/interfaces/Vec3Like';

/** Uniform fill from every direction; lifts shadows, adds no shading. */
export interface AmbientLightOptions {
  color?: string | number;
  intensity?: number;
}

/** Sky/ground gradient fill — cool from above, warm bounce from below. */
export interface HemisphereLightOptions {
  /** Color arriving from above. */
  skyColor?: string | number;
  /** Color bouncing up from below. */
  groundColor?: string | number;
  intensity?: number;
}

/**
 * The key light: parallel rays from `position` toward the origin. The only
 * light that casts shadows — the contact-shadow bake samples it as an area
 * light, so its direction sets where the floor shadow falls.
 */
export interface DirectionalLightOptions {
  color?: string | number;
  intensity?: number;
  /** Direction is position → origin; distance does not attenuate. */
  position?: Vec3Like | [number, number, number];
  /** Cast real-time shadows (and feed the baked contact shadow). */
  castShadow?: boolean;
  /** three.js DirectionalLight.shadow tuning; the shadow camera is auto-fitted to the model on load. */
  shadow?: {
    /** Shadow map resolution — higher is crisper and costs GPU memory. */
    mapSize?: {
      width: number;
      height: number;
    };
    /** Orthographic frustum bounds; overridden by the auto-fit on load. */
    camera?: {
      near?: number;
      far?: number;
      left?: number;
      right?: number;
      top?: number;
      bottom?: number;
    };
    /** Depth offset against shadow acne (self-shadowing stripes). */
    bias?: number;
    /** Shadow edge blur in shadow-map texels. */
    radius?: number;
  };
}

/**
 * The three-light studio rig. Every light is optional; the defaults are a
 * balanced product-shot setup (see `defaultOptions.lighting`).
 */
export interface LightingOptions {
  ambientLight?: AmbientLightOptions;
  hemisphereLight?: HemisphereLightOptions;
  directionalLight?: DirectionalLightOptions;
}
