import { ViewerFactory } from '../ViewerFactory';
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

  it('forces preserveDrawingBuffer when path tracing is enabled', async () => {
    const opts = await capturedOptions({ pathTracing: { enabled: true } });
    expect(opts.preserveDrawingBuffer).toBe(true);
  });

  it('forces preserveDrawingBuffer when replaceWithScreenshotOnComplete is set', async () => {
    const opts = await capturedOptions({ replaceWithScreenshotOnComplete: true });
    expect(opts.preserveDrawingBuffer).toBe(true);
  });

  it('leaves preserveDrawingBuffer unset when neither feature is used', async () => {
    const opts = await capturedOptions({});
    expect(opts.preserveDrawingBuffer).toBeUndefined();
  });
});
