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
/**
 * A recursively-optional view of T: every property may be omitted, and nested
 * plain objects may themselves be partial. Arrays are replaced whole, so they
 * keep their exact type.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export function deepMerge<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : override) as T;
  }
  // The two are structurally validated above; from here the merge walks plain
  // records, which is the one honest cast this module needs.
  const overrideRecord = override as Record<string, unknown>;

  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrideRecord)) {
    const overrideValue = overrideRecord[key];
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
