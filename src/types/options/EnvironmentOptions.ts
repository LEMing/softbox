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
}
