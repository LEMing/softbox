import type * as ThreeGpuPathtracer from 'three-gpu-pathtracer';

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
    const prototype = realModule.WebGLPathTracer.prototype;
    for (const getter of ['samples', 'tiles', 'bounces', 'transmissiveBounces']) {
      expect({ getter, has: Boolean(Object.getOwnPropertyDescriptor(prototype, getter)?.get) }).toEqual({
        getter,
        has: true,
      });
    }
    const constructorSource = String(realModule.WebGLPathTracer);
    for (const field of ['renderScale', 'lowResScale', 'dynamicLowRes']) {
      expect({ field, present: new RegExp(`\\b${field}\\b`).test(constructorSource) }).toEqual({
        field,
        present: true,
      });
    }
  });
});
