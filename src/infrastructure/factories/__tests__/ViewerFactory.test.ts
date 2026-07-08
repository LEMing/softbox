import { ViewerFactory, ExtendedModelLoaderFactory } from '../ViewerFactory';
import { ThreeRendererAdapter } from '../../three';
import { Result } from '../../../utils/Result';
import { IRendererOptions } from '../../../core/interfaces/IRenderer';
import { SimpleViewerOptions } from '../../../types/SimpleViewerOptions';

describe('ViewerFactory preserveDrawingBuffer', () => {
  let initSpy: jest.SpyInstance;

  beforeEach(() => {
    // Stop short of touching WebGL: capture the options handed to the renderer.
    initSpy = jest
      .spyOn(ThreeRendererAdapter.prototype, 'initialize')
      .mockReturnValue(Result.ok(undefined));
    // With the renderer stubbed, environment/path-tracing init warn as they
    // cannot reach a real WebGL context — expected and irrelevant here.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    initSpy.mockRestore();
    jest.restoreAllMocks();
  });

  const capturedOptions = async (options: SimpleViewerOptions): Promise<IRendererOptions> => {
    const viewer = ViewerFactory.createViewer(document.createElement('canvas'), options);
    await viewer.initialize();
    viewer.dispose();
    return initSpy.mock.calls[0][0] as IRendererOptions;
  };

  it('preserves the drawing buffer even with path tracing off (it can be enabled at runtime)', async () => {
    // Path tracing is now toggleable on any viewer, and a captured PT still
    // reads the persisted canvas — so the buffer must be preserved regardless
    // of the boot-time flag, keeping a runtime enable capture-ready.
    const opts = await capturedOptions({});
    expect(opts.preserveDrawingBuffer).toBe(true);
  });

  it('preserves the drawing buffer when path tracing starts enabled', async () => {
    const opts = await capturedOptions({ pathTracing: { enabled: true } });
    expect(opts.preserveDrawingBuffer).toBe(true);
  });

  it('preserves the drawing buffer when replaceWithScreenshotOnComplete is set', async () => {
    const opts = await capturedOptions({ replaceWithScreenshotOnComplete: true });
    expect(opts.preserveDrawingBuffer).toBe(true);
  });
});

describe('ViewerFactory selection.bvh threading', () => {
  let loaderSpy: jest.SpyInstance;

  beforeEach(() => {
    jest
      .spyOn(ThreeRendererAdapter.prototype, 'initialize')
      .mockReturnValue(Result.ok(undefined));
    loaderSpy = jest.spyOn(ExtendedModelLoaderFactory.prototype, 'createDefaultLoader');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('threads selection.bvh: false into the model loader', () => {
    ViewerFactory.createViewer(document.createElement('canvas'), { selection: { bvh: false } });
    expect(loaderSpy).toHaveBeenCalledWith(expect.objectContaining({ bvh: false }));
  });

  it('leaves the loader BVH default on when selection is not set', () => {
    ViewerFactory.createViewer(document.createElement('canvas'), {});
    expect(loaderSpy).toHaveBeenCalledWith(expect.objectContaining({ bvh: undefined }));
  });
});

describe('ViewerFactory units validation', () => {
  it('rejects an unknown units string before allocating any resource', () => {
    const rendererConstructed = jest.spyOn(ThreeRendererAdapter.prototype, 'initialize');
    const canvas = document.createElement('canvas');
    const addListener = jest.spyOn(canvas, 'addEventListener');

    expect(() =>
      ViewerFactory.createViewer(canvas, {
        units: 'furlongs' as unknown as SimpleViewerOptions['units'],
      })
    ).toThrow(/furlongs/);

    // Failing after allocation would leak controls listeners and the adapter
    // graph — nothing may touch the canvas before validation passes.
    expect(addListener).not.toHaveBeenCalled();
    expect(rendererConstructed).not.toHaveBeenCalled();
    rendererConstructed.mockRestore();
    addListener.mockRestore();
  });
});
