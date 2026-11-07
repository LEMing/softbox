import { deepMerge, DeepPartial } from '../deepMerge';

describe('deepMerge', () => {
  it('merges nested plain objects key-by-key without clobbering siblings', () => {
    const base = { renderer: { antialias: true, exposure: 1, shadows: true } };
    const result = deepMerge(base, { renderer: { exposure: 1.5 } });
    expect(result).toEqual({ renderer: { antialias: true, exposure: 1.5, shadows: true } });
  });

  it('replaces arrays instead of merging them', () => {
    const result = deepMerge({ position: [1, 2, 3] }, { position: [9, 8] });
    expect(result).toEqual({ position: [9, 8] });
  });

  it('ignores undefined override values so they never wipe a base value', () => {
    const result = deepMerge({ a: 1, b: 2 }, { a: undefined, b: 5 });
    expect(result).toEqual({ a: 1, b: 5 });
  });

  it('does not mutate either input', () => {
    const base = { nested: { x: 1 } };
    const override = { nested: { y: 2 } };
    // Shape-divergent on purpose: the runtime tolerates overrides the type
    // would reject, and these tests pin that defensive behavior.
    const result = deepMerge(base, override as DeepPartial<typeof base>);
    expect(base).toEqual({ nested: { x: 1 } });
    expect(override).toEqual({ nested: { y: 2 } });
    expect(result).toEqual({ nested: { x: 1, y: 2 } });
  });

  it('overrides a primitive base with an object and vice versa', () => {
    const objectOverride = { a: { deep: true } } as unknown as DeepPartial<{ a: number }>;
    expect(deepMerge({ a: 1 }, objectOverride)).toEqual({ a: { deep: true } });
    const primitiveOverride = { a: 1 } as unknown as DeepPartial<{ a: { deep: boolean } }>;
    expect(deepMerge({ a: { deep: true } }, primitiveOverride)).toEqual({ a: 1 });
  });

  it('returns the override when the base is not a plain object', () => {
    expect(deepMerge(5 as unknown, { a: 1 } as never)).toEqual({ a: 1 });
  });
});
