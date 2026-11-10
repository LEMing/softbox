import { ViewerRenderer } from '../ViewerRenderer';
import { PostProcessingPipeline } from '../PostProcessingPipeline';

jest.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    renderTarget1 = { samples: 0 };
    renderTarget2 = { samples: 0 };
    addPass() {}
    render() {}
    setSize() {}
    dispose() {}
  },
}));
jest.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({ RenderPass: class {} }));
jest.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({ OutputPass: class {} }));
jest.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({ UnrealBloomPass: class {} }));
jest.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => ({
  ShaderPass: class {
    uniforms = { offset: { value: 0 }, darkness: { value: 0 }, contrast: { value: 0 }, saturation: { value: 0 } };
  },
}));
jest.mock('three/examples/jsm/shaders/VignetteShader.js', () => ({ VignetteShader: {} }));
jest.mock('three/examples/jsm/shaders/BrightnessContrastShader.js', () => ({ BrightnessContrastShader: {} }));
jest.mock('three/examples/jsm/shaders/HueSaturationShader.js', () => ({ HueSaturationShader: {} }));


const stubInternalRenderer = () => ({
  setPixelRatio: jest.fn(),
  getPixelRatio: jest.fn(() => 1),
  getDrawingBufferSize: jest.fn((v: { set: (x: number, y: number) => unknown }) => v.set(800, 600)),
  capabilities: { maxSamples: 4 },
});

const makeAdapter = (requestedRatio: number) => {
  const adapter = new ViewerRenderer();
  const internal = stubInternalRenderer();
  (adapter as unknown as { renderer: unknown }).renderer = internal;
  (adapter as unknown as { requestedPixelRatio: number }).requestedPixelRatio = requestedRatio;
  return { adapter, internal };
};

const pipelineOf = (adapter: ViewerRenderer): PostProcessingPipeline | null =>
  (adapter as unknown as { postPipeline: PostProcessingPipeline | null }).postPipeline;

describe('ViewerRenderer.setPostProcessing', () => {
  it('builds a pipeline when an effect turns on, and caps the pixel ratio at 2', () => {
    const { adapter, internal } = makeAdapter(3);

    adapter.setPostProcessing({ bloom: true, vignette: false, filmGrain: false, colorGrade: false });

    expect(pipelineOf(adapter)).toBeInstanceOf(PostProcessingPipeline);
    expect(internal.setPixelRatio).toHaveBeenCalledWith(2);
  });

  it('drops the pipeline and restores the full pixel ratio when every effect turns off', () => {
    const { adapter, internal } = makeAdapter(3);
    adapter.setPostProcessing({ bloom: true, vignette: false, filmGrain: false, colorGrade: false });
    const first = pipelineOf(adapter)!;
    const disposeSpy = jest.spyOn(first, 'dispose');

    adapter.setPostProcessing({ bloom: false, vignette: false, filmGrain: false, colorGrade: false });

    expect(disposeSpy).toHaveBeenCalled();
    expect(pipelineOf(adapter)).toBeNull();
    expect(internal.setPixelRatio).toHaveBeenLastCalledWith(3);
  });

  it('resolves a colorGrade boolean/object into a concrete pipeline config', () => {
    const { adapter } = makeAdapter(1);

    adapter.setPostProcessing({ bloom: false, vignette: false, filmGrain: false, colorGrade: true });

    const pipeline = pipelineOf(adapter)!;
    const config = (pipeline as unknown as { config: { colorGrade: unknown } }).config;
    expect(config.colorGrade).toEqual({ contrast: 0.12, saturation: 0.15 });
  });

  it('is a safe no-op before the renderer is initialized', () => {
    const adapter = new ViewerRenderer();
    expect(() =>
      adapter.setPostProcessing({ bloom: true, vignette: false, filmGrain: false, colorGrade: false })
    ).not.toThrow();
    expect(pipelineOf(adapter)).toBeNull();
  });

  it('forwards a pipeline chunk-load failure to the registered error handler', async () => {
    const { adapter } = makeAdapter(1);
    const onError = jest.fn();
    adapter.setPostProcessingErrorHandler(onError);

    adapter.setPostProcessing({ bloom: true, vignette: false, filmGrain: false, colorGrade: false });
    const pipeline = pipelineOf(adapter)! as unknown as {
      onLoadError?: (error: unknown) => void;
    };
    pipeline.onLoadError?.(new Error('chunk fetch failed'));

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('tolerates a chunk-load failure with no handler registered', () => {
    const { adapter } = makeAdapter(1);
    adapter.setPostProcessing({ bloom: true, vignette: false, filmGrain: false, colorGrade: false });
    const pipeline = pipelineOf(adapter)! as unknown as {
      onLoadError?: (error: unknown) => void;
    };
    expect(() => pipeline.onLoadError?.(new Error('chunk fetch failed'))).not.toThrow();
  });
});
