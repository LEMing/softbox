/**
 * How the built-in procedural studio environment is graded when it is built.
 * `crisp` (the default) darkens the surround and boosts the soft-box panels so
 * glossy materials show distinct highlights; `soft` uses the studio room
 * as-built for an even, low-contrast wraparound light. Structural — the
 * environment is baked once at construction, so changing it rebuilds the
 * viewer. Scenes (`SimpleViewerOptions.scene`) drive this.
 */
export type StudioLook = 'crisp' | 'soft';

/** The grade the studio environment is built with when none is set. */
export const DEFAULT_STUDIO_LOOK: StudioLook = 'crisp';

/**
 * Image-based lighting and background. Without a `url` the viewer lights the
 * scene with its built-in procedural studio environment — zero network
 * requests.
 */
export interface EnvironmentOptions {
  /**
   * Equirectangular environment map (`.hdr`, `.exr`, or an LDR image) used
   * for both lighting and the background.
   */
  url?: string;
  /** Blurs the background rendering only (0–1); lighting stays sharp. */
  backgroundBlurriness?: number;
  /** Brightness multiplier for the background rendering only. */
  backgroundIntensity?: number;
  /**
   * Lighting intensity multiplier the environment applies to materials.
   * Runtime-tunable via `updateOptions` — presets drive this live.
   */
  environmentIntensity?: number;
  /** Grade of the built-in studio environment; ignored when `url` is set. */
  studioLook?: StudioLook;
  /**
   * Project the environment map onto a virtual ground plane so the model
   * appears to STAND in the environment instead of floating in front of it —
   * the outdoor scenes' horizon treatment (three's GroundedSkybox). `true`
   * uses the defaults (height 2m — a typical eye-level HDRI shot — and a
   * 120m world radius); pass numbers to match an HDRI shot from another
   * height or a larger set. Only applies when `url` is set. Structural —
   * changing it rebuilds the viewer.
   *
   * While active the projection mesh IS the visible backdrop, so
   * `backgroundBlurriness` has no effect (`backgroundIntensity` is emulated
   * by dimming the projection).
   */
  groundProjection?: boolean | { height?: number; radius?: number };
}
