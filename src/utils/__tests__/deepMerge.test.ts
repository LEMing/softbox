import { deepMerge } from '../deepMerge';

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
    const result = deepMerge(base, override);
    expect(base).toEqual({ nested: { x: 1 } });
    expect(override).toEqual({ nested: { y: 2 } });
    expect(result).toEqual({ nested: { x: 1, y: 2 } });
  });

  it('overrides a primitive base with an object and vice versa', () => {
    expect(deepMerge({ a: 1 }, { a: { deep: true } })).toEqual({ a: { deep: true } });
    expect(deepMerge({ a: { deep: true } }, { a: 1 })).toEqual({ a: 1 });
  });

  it('returns the override when the base is not a plain object', () => {
    expect(deepMerge(5 as unknown, { a: 1 })).toEqual({ a: 1 });
  });
});
