function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively merge `override` onto `base`, returning a new object. Nested plain
 * objects are merged key-by-key; arrays and primitives from `override` replace
 * the base value. `undefined` values in `override` are ignored so they never
 * wipe out a base value. Neither input is mutated.
 *
 * Used to layer a preset's partial options onto the defaults without clobbering
 * unrelated nested fields (e.g. a preset that only tweaks `renderer.toneMappingExposure`
 * keeps the default `renderer.shadowMapEnabled`).
 */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : override) as T;
  }

  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const overrideValue = override[key];
    if (overrideValue === undefined) {
      continue;
    }
    const baseValue = result[key];
    result[key] =
      isPlainObject(baseValue) && isPlainObject(overrideValue)
        ? deepMerge(baseValue, overrideValue)
        : overrideValue;
  }
  return result as T;
}
