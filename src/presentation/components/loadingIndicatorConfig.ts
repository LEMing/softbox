import { LoadingIndicatorOptions } from '../../types/options';

export interface ResolvedLoadingIndicator {
  enabled: boolean;
  label: string;
  errorLabel?: string;
  color: string;
  backdrop: string;
}

const DEFAULTS: ResolvedLoadingIndicator = {
  enabled: true,
  label: 'Loading…',
  color: '#ffffff',
  // Scrim dark enough that the white spinner stays legible (>4.5:1) on BOTH the
  // default light background (#f0f0f7) and dark studio mode.
  backdrop: 'rgba(15,16,20,0.6)',
};

/**
 * Normalize the `loadingIndicator` option (`undefined | boolean | object`) into
 * a concrete config. Omitted/`true` enables the default overlay; `false`
 * disables it; an object overrides individual fields.
 */
export function resolveLoadingIndicator(
  option: boolean | LoadingIndicatorOptions | undefined
): ResolvedLoadingIndicator {
  if (option === undefined || option === true) {
    return DEFAULTS;
  }
  if (option === false) {
    return { ...DEFAULTS, enabled: false };
  }
  return {
    enabled: option.enabled ?? true,
    label: option.label ?? DEFAULTS.label,
    errorLabel: option.errorLabel,
    color: option.color ?? DEFAULTS.color,
    backdrop: option.backdrop ?? DEFAULTS.backdrop,
  };
}
