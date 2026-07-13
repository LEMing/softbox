import { VIEWER_SCENES, resolveScene } from '../scenes';
import { VIEWER_PRESETS, mergeWithPreset } from '../presets';
import defaultOptions from '../defaultOptions';
import { deepMerge } from '../utils/deepMerge';
import { ViewerScene } from '../types/options';

const ALL_SCENES: ViewerScene[] = ['studio_dome', 'studio_soft'];

describe('viewer scenes', () => {
  it('defines every scene in the ViewerScene union', () => {
    expect(Object.keys(VIEWER_SCENES).sort()).toEqual([...ALL_SCENES].sort());
  });

  it('resolveScene returns an empty object when no scene is given', () => {
    expect(resolveScene()).toEqual({});
    expect(resolveScene(undefined)).toEqual({});
  });

  it('resolveScene returns the named scene delta', () => {
    expect(resolveScene('studio_soft')).toBe(VIEWER_SCENES.studio_soft);
  });

  it('every scene sets only structural set fields — never the live look fields presets own', () => {
    for (const name of ALL_SCENES) {
      const scene = VIEWER_SCENES[name];
      // The set: floor + how the studio environment is built.
      expect(scene.helpers?.grid).toBeDefined();
      expect(scene.helpers?.studioEnvironment).toBe(true);
      expect(scene.environment?.studioLook).toBeDefined();
      // No runtime look fields — those belong to the preset (tonal) axis, and
      // a scene carrying one would smuggle a rebuild into a "live" change.
      expect(scene.backgroundColor).toBeUndefined();
      expect(scene.backgroundColorEdge).toBeUndefined();
      expect(scene.renderer).toBeUndefined();
      expect(scene.environment?.environmentIntensity).toBeUndefined();
      expect(scene.controls).toBeUndefined();
      expect(scene.pathTracing).toBeUndefined();
      expect(scene.animations).toBeUndefined();
    }
  });

  it('studio_dome mirrors the defaults — scene: "studio_dome" and no scene are the same viewer', () => {
    expect(deepMerge(defaultOptions, VIEWER_SCENES.studio_dome)).toEqual(defaultOptions);
  });

  it('studio_soft only swaps the studio grade to soft', () => {
    const merged = deepMerge(defaultOptions, VIEWER_SCENES.studio_soft);
    expect(merged.environment?.studioLook).toBe('soft');
    const withDefaultGrade = deepMerge(merged, { environment: { studioLook: 'crisp' as const } });
    expect(withDefaultGrade).toEqual(defaultOptions);
  });
});

describe('mergeWithPreset with a scene', () => {
  it('layers the scene over the defaults without clobbering unrelated fields', () => {
    const merged = mergeWithPreset(defaultOptions, { scene: 'studio_soft' });
    expect(merged.environment?.studioLook).toBe('soft');
    expect(merged.environment?.environmentIntensity).toBe(
      defaultOptions.environment?.environmentIntensity
    );
    expect(merged.helpers?.studioEnvironment).toBe(true);
  });

  it('lets explicit options win over the scene', () => {
    const merged = mergeWithPreset(defaultOptions, {
      scene: 'studio_soft',
      environment: { studioLook: 'crisp' },
    });
    expect(merged.environment?.studioLook).toBe('crisp');
  });

  it('composes with a preset — the scene sets the set, the preset grades the picture', () => {
    const merged = mergeWithPreset(defaultOptions, { scene: 'studio_soft', preset: 'dark' });
    expect(merged.environment?.studioLook).toBe('soft');
    expect(merged.backgroundColor).toBe(VIEWER_PRESETS.dark.backgroundColor);
    expect(merged.environment?.environmentIntensity).toBe(
      VIEWER_PRESETS.dark.environment?.environmentIntensity
    );
  });
});
