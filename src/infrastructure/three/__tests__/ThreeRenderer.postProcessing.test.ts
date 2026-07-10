import { ThreeRendererAdapter } from '../ThreeRenderer';
import { PostProcessingPipeline } from '../postprocessing/PostProcessingPipeline';

/**
 * jsdom has no WebGL, so the adapter is tested around a stubbed internal
 * renderer: enough surface for setPostProcessing's pipeline swap + pixel-ratio
 * cap logic, which is pure orchestration.
 */
const stubInternalRenderer = () => ({
  setPixelRatio: jest.fn(),
  getPixelRatio: jest.fn(() => 1),
  getDrawingBufferSize: jest.fn((v: { set: (x: number, y: number) => unknown }) => v.set(800, 600)),
  capabilities: { maxSamples: 4 },
});

const makeAdapter = (requestedRatio: number) => {
  const adapter = new ThreeRendererAdapter();
  const internal = stubInternalRenderer();
  (adapter as unknown as { renderer: unknown }).renderer = internal;
  (adapter as unknown as { requestedPixelRatio: number }).requestedPixelRatio = requestedRatio;
  return { adapter, internal };
};

const pipelineOf = (adapter: ThreeRendererAdapter): PostProcessingPipeline | null =>
  (adapter as unknown as { postPipeline: PostProcessingPipeline | null }).postPipeline;

describe('ThreeRendererAdapter.setPostProcessing', () => {
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
    const adapter = new ThreeRendererAdapter();
    expect(() =>
      adapter.setPostProcessing({ bloom: true, vignette: false, filmGrain: false, colorGrade: false })
    ).not.toThrow();
    expect(pipelineOf(adapter)).toBeNull();
  });
});
