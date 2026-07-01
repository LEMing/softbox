import { ControlsUIOptions } from '../../../types/options';

export interface ResolvedControlsUI {
  enabled: boolean;
  toolbar: boolean;
  interactionModes: boolean;
  screenshot: boolean;
  fullscreen: boolean;
  modelBadge: boolean;
  settings: boolean;
  theme: 'dark' | 'light';
}

const ALL_ON = {
  toolbar: true,
  interactionModes: true,
  screenshot: true,
  fullscreen: true,
  modelBadge: true,
  settings: true,
  theme: 'dark' as const,
};

const DISABLED: ResolvedControlsUI = { enabled: false, ...ALL_ON };

/**
 * Normalize the `ui` option (`undefined | boolean | object`) into a concrete
 * config. Opt-in: omitted/`false` disables the overlay entirely; `true` enables
 * every piece; an object enables the overlay and toggles individual pieces
 * (each defaulting to on).
 */
export function resolveControlsUI(
  option: boolean | ControlsUIOptions | undefined
): ResolvedControlsUI {
  if (!option) {
    return DISABLED;
  }
  if (option === true) {
    return { enabled: true, ...ALL_ON };
  }
  return {
    enabled: option.enabled ?? true,
    toolbar: option.toolbar ?? true,
    interactionModes: option.interactionModes ?? true,
    screenshot: option.screenshot ?? true,
    fullscreen: option.fullscreen ?? true,
    modelBadge: option.modelBadge ?? true,
    settings: option.settings ?? true,
    theme: option.theme ?? 'dark',
  };
}
