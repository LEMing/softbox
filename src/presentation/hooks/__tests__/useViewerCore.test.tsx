import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useViewerCore } from '../useViewerCore';
import { ViewerFactory } from '../../../infrastructure/factories/ViewerFactory';
import { Result } from '../../../utils/Result';
import { SimpleViewerOptions } from '../../../types/SimpleViewerOptions';
import testDefaultOptions from '../../../testUtils/testDefaultOptions';

jest.mock('../../../infrastructure/factories/ViewerFactory');

interface FakeViewer {
  onStateChange: jest.Mock;
  initialize: jest.Mock;
  updateOptions: jest.Mock;
  resize: jest.Mock;
  dispose: jest.Mock;
}

describe('useViewerCore', () => {
  let createdViewers: FakeViewer[];

  const makeViewer = (): FakeViewer => {
    const viewer: FakeViewer = {
      onStateChange: jest.fn(() => jest.fn()),
      initialize: jest.fn().mockResolvedValue(Result.ok(undefined)),
      updateOptions: jest.fn(),
      resize: jest.fn(),
      dispose: jest.fn(),
    };
    createdViewers.push(viewer);
    return viewer;
  };

  const makeCanvasRef = () =>
    ({ current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement | null>);

  beforeEach(() => {
    createdViewers = [];
    (ViewerFactory.createViewer as unknown as jest.Mock) = jest.fn(makeViewer);
    global.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    }));
  });

  it('does not wire render-loop state into React (no per-frame re-render)', async () => {
    const canvasRef = makeCanvasRef();

    const { result } = renderHook(() => useViewerCore(canvasRef, testDefaultOptions));

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(1);
    // The render loop calls updateRenderInfo() every frame; if the hook subscribed
    // to onStateChange it would setState ~60x/sec for a value nothing reads. The
    // fix is to not subscribe at all.
    expect(createdViewers[0].onStateChange).not.toHaveBeenCalled();
    // The unused reactive `state` is no longer part of the hook's public return.
    expect(result.current).not.toHaveProperty('state');
  });

  it('applies a runtime-only change (backgroundColor) without rebuilding the viewer', async () => {
    const canvasRef = makeCanvasRef();

    const { result, rerender } = renderHook(
      ({ options }: { options: SimpleViewerOptions }) => useViewerCore(canvasRef, options),
      { initialProps: { options: testDefaultOptions } }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));
    expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(1);

    const viewer = createdViewers[0];
    viewer.updateOptions.mockClear();

    rerender({ options: { ...testDefaultOptions, backgroundColor: '#123456' } });

    await waitFor(() =>
      expect(viewer.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({ backgroundColor: '#123456' })
      )
    );

    // Same viewer instance — a runtime-only change must not tear down the renderer.
    expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(1);
    expect(viewer.dispose).not.toHaveBeenCalled();
  });

  it('applies a direct toneMappingExposure change live, without rebuilding', async () => {
    const canvasRef = makeCanvasRef();

    const { result, rerender } = renderHook(
      ({ options }: { options: SimpleViewerOptions }) => useViewerCore(canvasRef, options),
      { initialProps: { options: testDefaultOptions } }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));
    const viewer = createdViewers[0];
    viewer.updateOptions.mockClear();

    rerender({
      options: {
        ...testDefaultOptions,
        renderer: { ...testDefaultOptions.renderer, toneMappingExposure: 0.42 },
      },
    });

    await waitFor(() =>
      expect(viewer.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({ renderer: { toneMappingExposure: 0.42 } })
      )
    );
    expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(1);
    expect(viewer.dispose).not.toHaveBeenCalled();
  });

  it('rebuilds the viewer when loader options change (the loader is built with them)', async () => {
    const canvasRef = makeCanvasRef();

    const { result, rerender } = renderHook(
      ({ options }: { options: SimpleViewerOptions }) => useViewerCore(canvasRef, options),
      { initialProps: { options: testDefaultOptions } }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    rerender({ options: { ...testDefaultOptions, loaders: { draco: false } } });

    await waitFor(() => expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(2));
  });

  it('rebuilds the viewer when selection options change (the loader is built with them)', async () => {
    const canvasRef = makeCanvasRef();

    const { result, rerender } = renderHook(
      ({ options }: { options: SimpleViewerOptions }) => useViewerCore(canvasRef, options),
      { initialProps: { options: testDefaultOptions } }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    rerender({ options: { ...testDefaultOptions, selection: { bvh: false } } });

    await waitFor(() => expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(2));
  });

  it('rebuilds the viewer when units change (the model is re-wrapped at load)', async () => {
    const canvasRef = makeCanvasRef();

    const { result, rerender } = renderHook(
      ({ options }: { options: SimpleViewerOptions }) => useViewerCore(canvasRef, options),
      { initialProps: { options: testDefaultOptions } }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    rerender({ options: { ...testDefaultOptions, units: 'inches' } });

    await waitFor(() => expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(2));
  });

  it('does not rebuild when units flips between absent and the explicit default', async () => {
    const canvasRef = makeCanvasRef();

    const { result, rerender } = renderHook(
      ({ options }: { options: SimpleViewerOptions }) => useViewerCore(canvasRef, options),
      { initialProps: { options: testDefaultOptions } }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    rerender({ options: { ...testDefaultOptions, units: 'meters' } });

    // Behaviorally identical options must share a structural key.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(1);
  });

  it('contains a synchronous viewer-construction failure instead of crashing the host tree', async () => {
    const canvasRef = makeCanvasRef();
    (ViewerFactory.createViewer as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('Unknown units');
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result } = renderHook(() => useViewerCore(canvasRef, testDefaultOptions));

    await waitFor(() => expect(result.current.initError).toBeInstanceOf(Error));
    expect(result.current.isInitialized).toBe(false);
    expect(result.current.initError?.message).toBe('Unknown units');
    expect(consoleError).toHaveBeenCalledWith('Failed to create viewer:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('exposes initError when initialize() fails (e.g. WebGL unavailable)', async () => {
    const canvasRef = makeCanvasRef();
    const initFailure = new Error('WebGL context could not be created');
    (ViewerFactory.createViewer as unknown as jest.Mock).mockImplementation(() => {
      const viewer = makeViewer();
      viewer.initialize.mockResolvedValue(Result.err(initFailure));
      return viewer;
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result } = renderHook(() => useViewerCore(canvasRef, testDefaultOptions));

    await waitFor(() => expect(result.current.initError).toBe(initFailure));
    expect(result.current.isInitialized).toBe(false);
    consoleError.mockRestore();
  });

  it('rebuilds the viewer on a structural change (camera.fov)', async () => {
    const canvasRef = makeCanvasRef();

    const { result, rerender } = renderHook(
      ({ options }: { options: SimpleViewerOptions }) => useViewerCore(canvasRef, options),
      { initialProps: { options: testDefaultOptions } }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));
    const firstViewer = createdViewers[0];

    rerender({
      options: { ...testDefaultOptions, camera: { ...testDefaultOptions.camera, fov: 33 } },
    });

    await waitFor(() => expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(2));
    expect(firstViewer.dispose).toHaveBeenCalled();
  });

  it('toggles path tracing live, without rebuilding or reloading the model', async () => {
    const canvasRef = makeCanvasRef();

    const { result, rerender } = renderHook(
      ({ options }: { options: SimpleViewerOptions }) => useViewerCore(canvasRef, options),
      { initialProps: { options: testDefaultOptions } }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));
    const viewer = createdViewers[0];
    viewer.updateOptions.mockClear();

    // Flip ONLY `enabled`; the structural fields (maxSamples, bounces) stay put
    // — replacing the whole object would drop them and count as a structural
    // change. This mirrors how the playground toggles the tracer.
    rerender({
      options: {
        ...testDefaultOptions,
        pathTracing: { ...testDefaultOptions.pathTracing, enabled: true },
      },
    });

    await waitFor(() =>
      expect(viewer.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({ pathTracing: { enabled: true } })
      )
    );
    // Same viewer instance — flipping the tracer must not tear down the
    // renderer or re-fetch the model (this is what made the toggle distort the
    // aspect ratio and re-download the model).
    expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(1);
    expect(viewer.dispose).not.toHaveBeenCalled();
  });

  it('sizes a rebuilt viewer so its camera never stays at the default aspect', async () => {
    const canvasRef = makeCanvasRef();
    // A laid-out canvas so handleResize computes real dimensions.
    Object.defineProperty(canvasRef.current, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(canvasRef.current, 'clientHeight', { value: 400, configurable: true });

    const { result, rerender } = renderHook(
      ({ options }: { options: SimpleViewerOptions }) => useViewerCore(canvasRef, options),
      { initialProps: { options: testDefaultOptions } }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));
    await waitFor(() => expect(createdViewers[0].resize).toHaveBeenCalledWith(800, 400));

    // A structural change rebuilds the viewer onto the SAME (unchanged-size)
    // canvas. Without resetting the last-size memo the resize effect would
    // no-op here and the fresh viewer's camera would stay at aspect 1.
    rerender({
      options: { ...testDefaultOptions, camera: { ...testDefaultOptions.camera, fov: 33 } },
    });

    await waitFor(() => expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(createdViewers[1].resize).toHaveBeenCalledWith(800, 400));
  });

  it('deep-merges a preset over the defaults before building the viewer', async () => {
    const canvasRef = makeCanvasRef();

    const { result } = renderHook(() =>
      useViewerCore(canvasRef, { preset: 'product' })
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    const builtWith = (ViewerFactory.createViewer as jest.Mock).mock.calls[0][1] as SimpleViewerOptions;
    // Preset look applied...
    expect(builtWith.backgroundColor).toBe('#ffffff');
    expect(builtWith.renderer?.toneMappingExposure).toBe(1.2);
    // ...without clobbering unrelated defaults (deep merge, not replace).
    expect(builtWith.renderer?.shadowMapEnabled).toBe(true);
    expect(builtWith.camera?.autoFitToObject).toBe(true);
  });

  it('lets an explicit option win over the preset', async () => {
    const canvasRef = makeCanvasRef();

    const { result } = renderHook(() =>
      useViewerCore(canvasRef, { preset: 'product', backgroundColor: '#010203' })
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    const builtWith = (ViewerFactory.createViewer as jest.Mock).mock.calls[0][1] as SimpleViewerOptions;
    expect(builtWith.backgroundColor).toBe('#010203');
  });

  it('applies a preset change live, without rebuilding or reloading', async () => {
    const canvasRef = makeCanvasRef();

    const { result, rerender } = renderHook(
      ({ options }: { options: SimpleViewerOptions }) => useViewerCore(canvasRef, options),
      { initialProps: { options: { preset: 'studio' } as SimpleViewerOptions } }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));
    const viewer = createdViewers[0];
    viewer.updateOptions.mockClear();

    rerender({ options: { preset: 'dark' } });

    // The dark preset's look is applied live via updateOptions...
    await waitFor(() =>
      expect(viewer.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({ backgroundColor: '#242430', backgroundColorEdge: '#050507' })
      )
    );
    // ...and the viewer is neither rebuilt nor torn down (no model reload).
    expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(1);
    expect(viewer.dispose).not.toHaveBeenCalled();
  });

  describe('loading: lazy', () => {
    let intersect: ((intersecting: boolean) => void) | null;
    let observe: jest.Mock;
    let disconnect: jest.Mock;

    const installIntersectionObserver = () => {
      intersect = null;
      // Fresh fns per test: shared ones accumulate calls across tests and
      // pre-satisfy assertions like toHaveBeenCalled().
      observe = jest.fn();
      disconnect = jest.fn();
      (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = jest.fn(
        (callback: IntersectionObserverCallback) => {
          intersect = (isIntersecting: boolean) =>
            callback(
              [{ isIntersecting } as IntersectionObserverEntry],
              {} as IntersectionObserver
            );
          return { observe, disconnect, unobserve: jest.fn() };
        }
      );
    };

    afterEach(() => {
      delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    });

    it('defers the whole boot until the canvas approaches the viewport', async () => {
      installIntersectionObserver();
      const canvasRef = makeCanvasRef();

      const { result } = renderHook(() =>
        useViewerCore(canvasRef, { ...testDefaultOptions, loading: 'lazy' })
      );

      // No GL context, no model fetch — nothing until the gate opens.
      expect(ViewerFactory.createViewer).not.toHaveBeenCalled();
      expect(observe).toHaveBeenCalledWith(canvasRef.current);

      act(() => intersect!(true));

      await waitFor(() => expect(result.current.isInitialized).toBe(true));
      expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(1);
    });

    it('keeps the viewer alive when the canvas scrolls back out of view', async () => {
      installIntersectionObserver();
      const canvasRef = makeCanvasRef();

      const { result } = renderHook(() =>
        useViewerCore(canvasRef, { ...testDefaultOptions, loading: 'lazy' })
      );
      act(() => intersect!(true));
      await waitFor(() => expect(result.current.isInitialized).toBe(true));
      expect(disconnect).toHaveBeenCalled();

      // A scroll-out delivery (stale or otherwise) must not close the gate:
      // a non-latching gate would flip shouldBoot back and dispose the
      // booted viewer through the construction effect's cleanup.
      act(() => intersect!(false));

      expect(createdViewers[0].dispose).not.toHaveBeenCalled();
      expect(result.current.isInitialized).toBe(true);
    });

    it('boots immediately when IntersectionObserver is unavailable', async () => {
      const canvasRef = makeCanvasRef();

      const { result } = renderHook(() =>
        useViewerCore(canvasRef, { ...testDefaultOptions, loading: 'lazy' })
      );

      await waitFor(() => expect(result.current.isInitialized).toBe(true));
      expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(1);
    });

    it('boots when loading flips to eager before the canvas was ever visible', async () => {
      installIntersectionObserver();
      const canvasRef = makeCanvasRef();

      const { result, rerender } = renderHook(
        ({ options }: { options: SimpleViewerOptions }) => useViewerCore(canvasRef, options),
        { initialProps: { options: { ...testDefaultOptions, loading: 'lazy' } as SimpleViewerOptions } }
      );
      expect(ViewerFactory.createViewer).not.toHaveBeenCalled();

      rerender({ options: { ...testDefaultOptions, loading: 'eager' } as SimpleViewerOptions });

      await waitFor(() => expect(result.current.isInitialized).toBe(true));
      expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(1);
    });
  });
});
