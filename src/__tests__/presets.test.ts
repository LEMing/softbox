import { VIEWER_PRESETS, resolvePreset, mergeWithPreset } from '../presets';
import defaultOptions from '../defaultOptions';
import { ViewerPreset } from '../types/options';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';

const ALL_PRESETS: ViewerPreset[] = ['studio', 'product', 'neutral', 'dark', 'outdoor'];

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

  it('every preset sets only the live look fields (background, exposure, env intensity)', () => {
    for (const name of ALL_PRESETS) {
      const preset = VIEWER_PRESETS[name];
      expect(preset.backgroundColor).toEqual(expect.any(String));
      expect(preset.renderer?.toneMappingExposure).toEqual(expect.any(Number));
      expect(preset.environment?.environmentIntensity).toEqual(expect.any(Number));
      // No structural fields — switching a preset must never trigger a rebuild.
      expect(preset.pathTracing).toBeUndefined();
      expect(preset.camera).toBeUndefined();
      expect(preset.controls).toBeUndefined();
      expect(preset.helpers).toBeUndefined();
      expect(preset.lighting).toBeUndefined();
    }
  });

  it('studio mirrors the defaults — the built-in picker shows studio as active when no preset is set', () => {
    expect(VIEWER_PRESETS.studio.backgroundColor).toBe(defaultOptions.backgroundColor);
    expect(VIEWER_PRESETS.studio.renderer?.toneMappingExposure).toBe(
      defaultOptions.renderer?.toneMappingExposure
    );
    expect(VIEWER_PRESETS.studio.environment?.environmentIntensity).toBe(
      defaultOptions.environment?.environmentIntensity
    );
  });

  it('product is the brightest and studio is the neutral-light default', () => {
    expect(VIEWER_PRESETS.product.backgroundColor).toBe('#ffffff');
    expect(VIEWER_PRESETS.studio.backgroundColor).toBe('#f0f0f7');
    expect(VIEWER_PRESETS.dark.backgroundColor).toBe('#1a1a1f');
  });
});

describe('mergeWithPreset', () => {
  const defaults: SimpleViewerOptions = {
    backgroundColor: '#000000',
    renderer: { antialias: true, toneMappingExposure: 3 },
    environment: { environmentIntensity: 3 },
  };

  it('layers the preset over the defaults without clobbering unrelated fields', () => {
    const merged = mergeWithPreset(defaults, { preset: 'product' });
    expect(merged.backgroundColor).toBe('#ffffff');
    expect(merged.renderer?.toneMappingExposure).toBe(1.25);
    expect(merged.renderer?.antialias).toBe(true); // preserved via deep merge
  });

  it('lets explicit options win over the preset', () => {
    const merged = mergeWithPreset(defaults, { preset: 'product', backgroundColor: '#abcabc' });
    expect(merged.backgroundColor).toBe('#abcabc');
  });

  it('returns the defaults when no preset is set', () => {
    const merged = mergeWithPreset(defaults, {});
    expect(merged.backgroundColor).toBe('#000000');
  });
});
