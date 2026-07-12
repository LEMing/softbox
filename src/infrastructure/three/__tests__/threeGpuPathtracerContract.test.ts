/**
 * API-drift canary against the REAL three-gpu-pathtracer package.
 *
 * Unit tests run against hand-written mocks (jest.config.js moduleNameMapper),
 * so a dependency bump that renames or removes the surface the service touches
 * passes 800+ green tests and fails only in a browser — exactly how the 0.0.24
 * upgrade shipped black models past the whole suite. This file bypasses the
 * mock and asserts the real package still exposes what ThreePathTracingService
 * and PathTracerTypes actually consume.
 *
 * Honest scope: this catches API drift (renames/removals), NOT behavior — the
 * render-smoke path-tracing probe is the behavioral half of the guard.
 */
import type * as ThreeGpuPathtracer from 'three-gpu-pathtracer';

// jest.requireActual does NOT bypass moduleNameMapper — importing the bare
// specifier here would hand back our own mock and the canary would test
// itself. The UMD build path escapes the ^three-gpu-pathtracer$ mapping and
// loads the genuine package.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS build loads without ESM transform gymnastics
const realModule = require('three-gpu-pathtracer/build/index.umd.cjs') as typeof ThreeGpuPathtracer;

describe('three-gpu-pathtracer API contract (real package, mock bypassed)', () => {
  it('exposes the classes the service imports', () => {
    expect(typeof realModule.WebGLPathTracer).toBe('function');
  });

  it('WebGLPathTracer exposes the methods the service calls', () => {
    const prototype = realModule.WebGLPathTracer.prototype as unknown as Record<string, unknown>;
    for (const method of ['setScene', 'renderSample', 'updateCamera', 'updateLights', 'reset', 'dispose']) {
      expect({ method, type: typeof prototype[method] }).toEqual({ method, type: 'function' });
    }
  });

  it('WebGLPathTracer instances expose the fields the service tunes', () => {
    // Constructing needs a real renderer; the tunable fields live as own
    // accessors/properties, so a prototype + descriptor scan covers them
    // without a GL context. `samples`, `tiles` and `copyQuad` are getters on
    // the prototype; `bounces`/`renderScale`/... are plain instance fields
    // assigned in the constructor, which the source string still names.
    const prototype = realModule.WebGLPathTracer.prototype;
    for (const getter of ['samples', 'tiles']) {
      expect({ getter, has: Boolean(Object.getOwnPropertyDescriptor(prototype, getter)?.get) }).toEqual({
        getter,
        has: true,
      });
    }
    const constructorSource = String(realModule.WebGLPathTracer);
    for (const field of ['bounces', 'renderScale', 'lowResScale', 'dynamicLowRes', 'transmissiveBounces']) {
      expect({ field, present: constructorSource.includes(`${field}`) }).toEqual({
        field,
        present: true,
      });
    }
  });
});
