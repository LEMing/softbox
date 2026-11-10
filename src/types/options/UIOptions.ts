import { ViewerPreset } from './PresetOptions';

export interface UIOptions {
  presets?: boolean;

  onPresetChange?: (preset: ViewerPreset) => void;
}
