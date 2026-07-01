import { VIEWER_PRESETS, resolvePreset } from '../presets';
import { ViewerPreset } from '../types/options';

const ALL_PRESETS: ViewerPreset[] = [
  'studio',
  'product',
  'neutral',
  'dark',
  'outdoor',
  'photoreal',
];

describe('viewer presets', () => {
  it('defines every preset in the ViewerPreset union', () => {
    expect(Object.keys(VIEWER_PRESETS).sort()).toEqual([...ALL_PRESETS].sort());
  });

  it('resolvePreset returns an empty object when no preset is given', () => {
    expect(resolvePreset()).toEqual({});
    expect(resolvePreset(undefined)).toEqual({});
  });

  it('resolvePreset returns the named preset delta', () => {
    expect(resolvePreset('product')).toBe(VIEWER_PRESETS.product);
  });

  it('every preset keeps the studio environment on so a model is always lit', () => {
    for (const name of ALL_PRESETS) {
      expect(VIEWER_PRESETS[name].helpers?.studioEnvironment).toBe(true);
    }
  });

  it('only the dark preset uses dark studio mode', () => {
    for (const name of ALL_PRESETS) {
      expect(VIEWER_PRESETS[name].helpers?.darkStudioMode).toBe(name === 'dark');
    }
  });

  it('the photoreal preset enables path tracing for a hero still', () => {
    expect(VIEWER_PRESETS.photoreal.pathTracing?.enabled).toBe(true);
    expect(VIEWER_PRESETS.photoreal.replaceWithScreenshotOnComplete).toBe(true);
  });

  it('the product preset is the brightest and studio is neutral-light', () => {
    expect(VIEWER_PRESETS.product.backgroundColor).toBe('#ffffff');
    expect(VIEWER_PRESETS.studio.backgroundColor).toBe('#f0f0f7');
  });
});
