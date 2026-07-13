import { renderHook } from '@testing-library/react';
import { useStableOptions } from '../useStableOptions';
import { SimpleViewerOptions } from '../../../types/SimpleViewerOptions';
import {
  RUNTIME_RENDERER_FIELDS,
  RUNTIME_ENVIRONMENT_FIELDS,
  RUNTIME_CONTROLS_FIELDS,
  RUNTIME_PATH_TRACING_FIELDS,
} from '../../../types/runtimeOptions';

/**
 * The option-partition contract. Every top-level `SimpleViewerOptions` key MUST
 * be classified here — the `Record<keyof Required<...>>` type makes adding an
 * option without classifying it a compile error, and the suites below verify
 * each classification against the real hook. This is the guard against the
 * recurring bug class where an option lands in NEITHER key list and silently
 * no-ops on a live viewer (`units` in one audit cycle, `floorAlignment` in the
 * next).
 *
 * Kinds:
 * - structural: changing it must change the structural key (viewer rebuild);
 * - runtime:    changing it must change the runtime key and NOT the structural
 *               key (applied live, never rebuilds);
 * - split:      the object carries both halves — a structural-field change
 *               must move only the structural key, a runtime-field change only
 *               the runtime key;
 * - inert:      deliberately in neither key (callbacks read through refs,
 *               React chrome, boot gating) — changing it must move neither.
 */
type KeyCase =
  | { kind: 'structural'; a: unknown; b: unknown }
  | { kind: 'runtime'; a: unknown; b: unknown }
  | { kind: 'split'; structuralA: unknown; structuralB: unknown; runtimeA: unknown; runtimeB: unknown }
  | { kind: 'inert'; a: unknown; b: unknown };

const OPTION_KEY_CONTRACT: Record<keyof Required<SimpleViewerOptions>, KeyCase> = {
  preset: { kind: 'runtime', a: 'studio', b: 'dark' },
  scene: { kind: 'structural', a: 'studio_dome', b: 'studio_soft' },
  variant: { kind: 'runtime', a: 'beach', b: 'midnight' },
  units: { kind: 'structural', a: 'meters', b: 'centimeters' },
  floorAlignment: { kind: 'structural', a: true, b: false },
  backgroundColor: { kind: 'runtime', a: '#ffffff', b: '#000000' },
  backgroundColorEdge: { kind: 'runtime', a: '#ffffff', b: '#000000' },
  staticScene: { kind: 'structural', a: true, b: false },
  animations: { kind: 'runtime', a: { autoplay: true }, b: { autoplay: 'Walk' } },
  camera: { kind: 'structural', a: { fov: 45 }, b: { fov: 60 } },
  controls: {
    kind: 'split',
    structuralA: { enableDamping: true },
    structuralB: { enableDamping: false },
    runtimeA: { autoRotate: false },
    runtimeB: { autoRotate: true },
  },
  environment: {
    kind: 'split',
    structuralA: { url: 'a.hdr' },
    structuralB: { url: 'b.hdr' },
    runtimeA: { environmentIntensity: 0.5 },
    runtimeB: { environmentIntensity: 1.5 },
  },
  helpers: { kind: 'structural', a: { grid: { type: 'hexagonal_glass' } }, b: { grid: { type: 'square_wire' } } },
  lighting: { kind: 'structural', a: { ambientLight: { intensity: 0.4 } }, b: { ambientLight: { intensity: 0.8 } } },
  pathTracing: {
    kind: 'split',
    structuralA: { maxSamples: 64 },
    structuralB: { maxSamples: 256 },
    runtimeA: { enabled: false },
    runtimeB: { enabled: true },
  },
  renderer: {
    kind: 'split',
    structuralA: { antialias: true },
    structuralB: { antialias: false },
    runtimeA: { bloom: false },
    runtimeB: { bloom: true },
  },
  rendering: { kind: 'structural', a: { enableIdleDetection: true }, b: { enableIdleDetection: false } },
  onLoad: { kind: 'inert', a: () => {}, b: () => {} },
  onProgress: { kind: 'inert', a: (_p: number) => {}, b: (_p: number) => {} },
  onError: { kind: 'inert', a: (_e: Error) => {}, b: (_e: Error) => {} },
  // Dead public option: declared in the type, consumed by nothing (audit
  // 2026-07-12) — inert until it is either wired or removed.
  animationLoop: { kind: 'inert', a: (_t: number) => {}, b: null },
  replaceWithScreenshotOnComplete: { kind: 'structural', a: false, b: true },
  loading: { kind: 'inert', a: 'eager', b: 'lazy' },
  loadingIndicator: { kind: 'inert', a: true, b: { label: 'Loading…' } },
  loaders: { kind: 'structural', a: {}, b: { dracoDecoderPath: '/draco/' } },
  ui: { kind: 'inert', a: { presets: false }, b: { presets: true } },
  selection: { kind: 'structural', a: { bvh: true }, b: { bvh: false } },
};

const keysFor = (options: SimpleViewerOptions) => {
  const { result } = renderHook(() => useStableOptions(options));
  return { structural: result.current.structuralKey, runtime: result.current.runtimeKey };
};

describe('useStableOptions option-partition contract', () => {
  const entries = Object.entries(OPTION_KEY_CONTRACT) as Array<[
    keyof SimpleViewerOptions,
    KeyCase,
  ]>;

  it.each(entries.filter(([, c]) => c.kind === 'structural'))(
    'structural: changing %s moves the structural key',
    (key, keyCase) => {
      const c = keyCase as Extract<KeyCase, { kind: 'structural' }>;
      const before = keysFor({ [key]: c.a });
      const after = keysFor({ [key]: c.b });
      expect(after.structural).not.toBe(before.structural);
    }
  );

  it.each(entries.filter(([, c]) => c.kind === 'runtime'))(
    'runtime: changing %s moves the runtime key and never the structural key',
    (key, keyCase) => {
      const c = keyCase as Extract<KeyCase, { kind: 'runtime' }>;
      const before = keysFor({ [key]: c.a });
      const after = keysFor({ [key]: c.b });
      expect(after.runtime).not.toBe(before.runtime);
      expect(after.structural).toBe(before.structural);
    }
  );

  it.each(entries.filter(([, c]) => c.kind === 'split'))(
    'split: %s moves exactly the half its changed field belongs to',
    (key, keyCase) => {
      const c = keyCase as Extract<KeyCase, { kind: 'split' }>;
      const structuralBefore = keysFor({ [key]: c.structuralA });
      const structuralAfter = keysFor({ [key]: c.structuralB });
      expect(structuralAfter.structural).not.toBe(structuralBefore.structural);
      expect(structuralAfter.runtime).toBe(structuralBefore.runtime);

      const runtimeBefore = keysFor({ [key]: c.runtimeA });
      const runtimeAfter = keysFor({ [key]: c.runtimeB });
      expect(runtimeAfter.runtime).not.toBe(runtimeBefore.runtime);
      expect(runtimeAfter.structural).toBe(runtimeBefore.structural);
    }
  );

  it.each(entries.filter(([, c]) => c.kind === 'inert'))(
    'inert: changing %s moves neither key',
    (key, keyCase) => {
      const c = keyCase as Extract<KeyCase, { kind: 'inert' }>;
      const before = keysFor({ [key]: c.a });
      const after = keysFor({ [key]: c.b });
      expect(after.structural).toBe(before.structural);
      expect(after.runtime).toBe(before.runtime);
    }
  );

  it('gizmo is React chrome: toggling it moves neither key (no WebGL teardown)', () => {
    const before = keysFor({ helpers: { grid: { type: 'hexagonal_glass' }, gizmo: false } });
    const after = keysFor({
      helpers: { grid: { type: 'hexagonal_glass' }, gizmo: { placement: 'top-right' } },
    });
    expect(after.structural).toBe(before.structural);
    expect(after.runtime).toBe(before.runtime);
  });

  it('every RUNTIME_* field genuinely moves the runtime key (list<->picker coupling)', () => {
    // The RUNTIME_* lists and pickRuntimeOptions are coupled by hand; a field
    // added to a list but missed in the picker recreates the silent-no-op bug
    // class ONE LEVEL BELOW the top-level contract above. Derived, not
    // example-based: iterate the lists themselves.
    const sampleValues: Record<string, [unknown, unknown]> = {
      toneMappingExposure: [1, 1.8],
      bloom: [false, true],
      vignette: [false, true],
      filmGrain: [false, true],
      colorGrade: [false, true],
      environmentIntensity: [0.5, 1.5],
      autoRotate: [false, true],
      autoRotateSpeed: [2, 5],
      enabled: [false, true],
    };
    const parents: Array<[keyof SimpleViewerOptions, readonly string[]]> = [
      ['renderer', RUNTIME_RENDERER_FIELDS],
      ['environment', RUNTIME_ENVIRONMENT_FIELDS],
      ['controls', RUNTIME_CONTROLS_FIELDS],
      ['pathTracing', RUNTIME_PATH_TRACING_FIELDS],
    ];
    for (const [parent, fields] of parents) {
      for (const field of fields) {
        const [a, b] = sampleValues[field] ?? [];
        expect({ field, hasSamples: a !== undefined || b !== undefined }).toEqual({
          field,
          hasSamples: true,
        });
        const before = keysFor({ [parent]: { [field]: a } } as SimpleViewerOptions);
        const after = keysFor({ [parent]: { [field]: b } } as SimpleViewerOptions);
        expect({ parent, field, moved: after.runtime !== before.runtime }).toEqual({
          parent,
          field,
          moved: true,
        });
        expect({ parent, field, structuralStable: after.structural === before.structural }).toEqual({
          parent,
          field,
          structuralStable: true,
        });
      }
    }
  });

  it('floorAlignment is normalized: absent and explicit true share a structural key', () => {
    const absent = keysFor({});
    const explicit = keysFor({ floorAlignment: true });
    expect(explicit.structural).toBe(absent.structural);
  });

  it('scene is normalized: absent and the explicit default share a structural key', () => {
    const absent = keysFor({});
    const explicit = keysFor({ scene: 'studio_dome' });
    expect(explicit.structural).toBe(absent.structural);
  });

  it('switching the scene leaves the runtime key alone — scenes carry no live look fields', () => {
    const dome = keysFor({ scene: 'studio_dome' });
    const soft = keysFor({ scene: 'studio_soft' });
    expect(soft.runtime).toBe(dome.runtime);
  });
});
