import { Vec3Like } from '../../core/interfaces/Vec3Like';

/** Uniform fill from every direction; lifts shadows, adds no shading. */
export interface AmbientLightOptions {
  color?: string | number;
  intensity?: number;
}

/**
 * Two-tone gradient fill: one color arriving from above, another bouncing up
 * from below. The default rig uses a warm pale-yellow sky over a dark navy
 * ground.
 */
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
    /**
     * Orthographic frustum: every plane (left/right/top/bottom AND near/far)
     * is overridden by the auto-fit on load, so the shadow-map texel density
     * and the bias's world-space offset both scale with the model.
     */
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
    /**
     * WORLD-SPACE offset along the receiver's normal against shadow acne.
     * Unlike `bias` (normalized depth, whose world effect scales with the
     * fitted camera range), this is absolute — the scale-correct escape hatch
     * if acne ever shows on a model's own surfaces.
     */
    normalBias?: number;
    /** Shadow edge blur in shadow-map texels. */
    radius?: number;
  };
}

/**
 * A soft, shadowless directional light used for the fill and rim/back roles of
 * a studio three-point rig. Same direction semantics as the key, but it never
 * casts shadows (only the key does — see `findDirectionalLight`, which resolves
 * the first directional as the shadow/contact-shadow source).
 */
export interface AccentLightOptions {
  color?: string | number;
  intensity?: number;
  /** Direction is position → origin; distance does not attenuate. */
  position?: Vec3Like | [number, number, number];
}

/**
 * The studio rig. Every light is optional; the defaults are a balanced
 * product-shot three-point setup (see `defaultOptions.lighting`): a shadow-
 * casting key, a soft opposite-side fill that opens the shadow, and a rim/back
 * light behind the subject that separates its silhouette from the background.
 * Ambient + hemisphere add a gentle omnidirectional base.
 */
export interface LightingOptions {
  ambientLight?: AmbientLightOptions;
  hemisphereLight?: HemisphereLightOptions;
  directionalLight?: DirectionalLightOptions;
  /** Soft opposite-side fill; opens the shadow side without a second shadow. */
  fillLight?: AccentLightOptions;
  /** Rim/back light behind the subject; separates the silhouette from the backdrop. */
  rimLight?: AccentLightOptions;
}
