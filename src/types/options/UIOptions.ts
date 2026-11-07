import { ViewerPreset } from './PresetOptions';

/**
 * Built-in UI chrome rendered over the canvas. Everything here is opt-in and
 * UI-only — toggling it never rebuilds the viewer or reloads the model.
 */
export interface UIOptions {
  /**
   * Show the built-in preset picker: a row of chips over the canvas that
   * switches the visual preset live. Off by default. Turning the picker off
   * also clears any preset picked through it — your own `preset` takes over.
   */
  presets?: boolean;

  /**
   * Called when the user picks a preset via the built-in picker, e.g. to
   * persist the choice. A later change to your own `preset` prop/option
   * overrides the picked one; echoing a reported pick back into `preset`
   * (even asynchronously) is safe and never reverts a newer pick.
   */
  onPresetChange?: (preset: ViewerPreset) => void;
}
