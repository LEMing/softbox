import * as THREE from 'three';
import { PostProcessingPipeline, anyPostEffectEnabled, PostProcessingConfig } from '../PostProcessingPipeline';

class FakeComposer {
  passes: unknown[] = [];
  renderCount = 0;
  size: [number, number] | null = null;
  disposed = false;
  renderTarget1 = { samples: 0 };
  renderTarget2 = { samples: 0 };
  pixelRatio: number | null = null;
  constructor(
    public renderer: unknown,
    public target: unknown
  ) {}
  addPass(pass: unknown): void {
    this.passes.push(pass);
  }
  render(): void {
    this.renderCount++;
  }
  setSize(w: number, h: number): void {
    this.size = [w, h];
  }
  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
  }
  dispose(): void {
    this.disposed = true;
  }
}
class FakeRenderPass {}
class FakeOutputPass {}
class FakeBloomPass {
  constructor(
    public resolution: unknown,
    public strength: number,
    public radius: number,
    public threshold: number
  ) {}
}
interface ShaderLike {
  uniforms?: Record<string, { value: unknown }>;
  fragmentShader?: string;
}
class FakeShaderPass {
  uniforms: Record<string, { value: unknown }>;
  constructor(public shader: ShaderLike) {
    // Mirror the real ShaderPass, which clones the shader's uniforms; fall back
    // to the vignette uniforms when the mocked shader carries none.
    this.uniforms = shader?.uniforms ?? { offset: { value: 0 }, darkness: { value: 0 } };
  }
}

jest.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({ EffectComposer: FakeComposer }));
jest.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({ RenderPass: FakeRenderPass }));
jest.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({ OutputPass: FakeOutputPass }));
jest.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({ UnrealBloomPass: FakeBloomPass }));
jest.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => ({ ShaderPass: FakeShaderPass }));
jest.mock('three/examples/jsm/shaders/VignetteShader.js', () => ({ VignetteShader: { name: 'vignette' } }));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const fakeRenderer = () =>
  ({
    getSize: (v: THREE.Vector2) => v.set(800, 600),
    getDrawingBufferSize: (v: THREE.Vector2) => v.set(1600, 1200),
    capabilities: { maxSamples: 8 },
  }) as unknown as THREE.WebGLRenderer;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();

const allOff: PostProcessingConfig = { bloom: false, vignette: false, filmGrain: false };

describe('anyPostEffectEnabled', () => {
  it('is false when every effect is off', () => {
    expect(anyPostEffectEnabled(allOff)).toBe(false);
  });

  it('is true when any single effect is on', () => {
    expect(anyPostEffectEnabled({ ...allOff, bloom: true })).toBe(true);
    expect(anyPostEffectEnabled({ ...allOff, vignette: true })).toBe(true);
    expect(anyPostEffectEnabled({ ...allOff, filmGrain: true })).toBe(true);
  });
});

describe('PostProcessingPipeline', () => {
  it('is not ready until the lazy chunk resolves, then becomes ready', async () => {
    const pipeline = new PostProcessingPipeline(fakeRenderer(), { ...allOff, bloom: true });
    expect(pipeline.isReady()).toBe(false);
    await flush();
    expect(pipeline.isReady()).toBe(true);
  });

  it('render() returns false while loading and does not throw', () => {
    const pipeline = new PostProcessingPipeline(fakeRenderer(), { ...allOff, bloom: true });
    expect(pipeline.render(scene, camera)).toBe(false);
  });

  it('builds the composer once and renders through it', async () => {
    const pipeline = new PostProcessingPipeline(fakeRenderer(), { ...allOff, bloom: true });
    await flush();
    expect(pipeline.render(scene, camera)).toBe(true);
    expect(pipeline.render(scene, camera)).toBe(true);
    const composer = getComposer(pipeline);
    expect(composer.renderCount).toBe(2);
  });

  it('wires only RenderPass + OutputPass when just one display effect is on', async () => {
    const pipeline = new PostProcessingPipeline(fakeRenderer(), { ...allOff, vignette: true });
    await flush();
    pipeline.render(scene, camera);
    const passes = getComposer(pipeline).passes;
    expect(passes[0]).toBeInstanceOf(FakeRenderPass);
    expect(passes.some((p) => p instanceof FakeOutputPass)).toBe(true);
    expect(passes.some((p) => p instanceof FakeBloomPass)).toBe(false);
    // Vignette (a ShaderPass) is appended after OutputPass.
    const outputIndex = passes.findIndex((p) => p instanceof FakeOutputPass);
    const shaderIndex = passes.findIndex((p) => p instanceof FakeShaderPass);
    expect(shaderIndex).toBeGreaterThan(outputIndex);
  });

  it('runs bloom before OutputPass (linear HDR) and the grain after it (display space)', async () => {
    // Grain-only (no vignette) so the single ShaderPass is unambiguously the grain.
    const pipeline = new PostProcessingPipeline(fakeRenderer(), {
      bloom: true,
      vignette: false,
      filmGrain: true,
    });
    await flush();
    pipeline.render(scene, camera);
    const passes = getComposer(pipeline).passes;
    const bloomIndex = passes.findIndex((p) => p instanceof FakeBloomPass);
    const outputIndex = passes.findIndex((p) => p instanceof FakeOutputPass);
    const grainIndex = passes.findIndex((p) => p instanceof FakeShaderPass);
    expect(bloomIndex).toBeGreaterThanOrEqual(0);
    expect(bloomIndex).toBeLessThan(outputIndex);
    expect(grainIndex).toBeGreaterThan(outputIndex);
  });

  it('sets the vignette shader uniforms from the tuned defaults', async () => {
    const pipeline = new PostProcessingPipeline(fakeRenderer(), { ...allOff, vignette: true });
    await flush();
    pipeline.render(scene, camera);
    const shader = getComposer(pipeline).passes.find((p) => p instanceof FakeShaderPass) as FakeShaderPass;
    expect(shader.uniforms.offset.value as number).toBeGreaterThan(1);
    expect(shader.uniforms.darkness.value as number).toBeGreaterThan(0);
  });

  it('gives the static grain a non-animated shader (intensity, no time uniform)', async () => {
    const pipeline = new PostProcessingPipeline(fakeRenderer(), { ...allOff, filmGrain: true });
    await flush();
    pipeline.render(scene, camera);
    const grain = getComposer(pipeline).passes.find((p) => p instanceof FakeShaderPass) as FakeShaderPass;
    // Grain carries an intensity uniform and NO time uniform (a time uniform is
    // what would make it shimmer frame to frame); it seeds off gl_FragCoord so
    // it needs no resolution uniform to track resizes.
    expect(grain.uniforms.intensity).toBeDefined();
    expect(grain.uniforms.time).toBeUndefined();
    expect(grain.uniforms.resolution).toBeUndefined();
    expect(grain.shader.fragmentShader).toContain('gl_FragCoord');
  });

  it('caps MSAA samples at 4 even when the GPU reports more', async () => {
    const pipeline = new PostProcessingPipeline(fakeRenderer(), { ...allOff, bloom: true });
    await flush();
    pipeline.render(scene, camera);
    const composer = getComposer(pipeline);
    expect(composer.renderTarget1.samples).toBe(4);
    expect(composer.renderTarget2.samples).toBe(4);
  });

  it('forwards setSize to the composer', async () => {
    const pipeline = new PostProcessingPipeline(fakeRenderer(), { ...allOff, bloom: true });
    await flush();
    pipeline.render(scene, camera);
    pipeline.setSize(320, 240);
    expect(getComposer(pipeline).size).toEqual([320, 240]);
  });

  it('forwards setPixelRatio to the composer so its targets are not scaled by a stale ratio', async () => {
    const pipeline = new PostProcessingPipeline(fakeRenderer(), { ...allOff, bloom: true });
    await flush();
    pipeline.render(scene, camera);
    pipeline.setPixelRatio(1);
    expect(getComposer(pipeline).pixelRatio).toBe(1);
  });

  it('setPixelRatio before the composer builds does not throw', () => {
    const pipeline = new PostProcessingPipeline(fakeRenderer(), { ...allOff, bloom: true });
    expect(() => pipeline.setPixelRatio(1)).not.toThrow();
  });

  it('dispose() tears down the composer and blocks further rendering', async () => {
    const pipeline = new PostProcessingPipeline(fakeRenderer(), { ...allOff, bloom: true });
    await flush();
    pipeline.render(scene, camera);
    const composer = getComposer(pipeline);
    pipeline.dispose();
    expect(composer.disposed).toBe(true);
    expect(pipeline.isReady()).toBe(false);
    expect(pipeline.render(scene, camera)).toBe(false);
  });

  it('does not become ready if disposed before the chunk resolves', async () => {
    const pipeline = new PostProcessingPipeline(fakeRenderer(), { ...allOff, bloom: true });
    pipeline.dispose();
    await flush();
    expect(pipeline.isReady()).toBe(false);
  });
});

function getComposer(pipeline: PostProcessingPipeline): FakeComposer {
  return (pipeline as unknown as { composer: FakeComposer }).composer;
}
