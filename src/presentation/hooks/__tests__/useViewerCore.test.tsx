import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
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
      expect(viewer.updateOptions).toHaveBeenCalledWith({ backgroundColor: '#123456' })
    );

    // Same viewer instance — a runtime-only change must not tear down the renderer.
    expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(1);
    expect(viewer.dispose).not.toHaveBeenCalled();
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

  it('deep-merges a preset over the defaults before building the viewer', async () => {
    const canvasRef = makeCanvasRef();

    const { result } = renderHook(() =>
      useViewerCore(canvasRef, { preset: 'product' })
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    const builtWith = (ViewerFactory.createViewer as jest.Mock).mock.calls[0][1] as SimpleViewerOptions;
    // Preset look applied...
    expect(builtWith.backgroundColor).toBe('#ffffff');
    expect(builtWith.renderer?.toneMappingExposure).toBe(1.25);
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

  it('rebuilds the viewer when the preset changes', async () => {
    const canvasRef = makeCanvasRef();

    const { result, rerender } = renderHook(
      ({ options }: { options: SimpleViewerOptions }) => useViewerCore(canvasRef, options),
      { initialProps: { options: { preset: 'studio' } as SimpleViewerOptions } }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));
    const firstViewer = createdViewers[0];

    rerender({ options: { preset: 'dark' } });

    await waitFor(() => expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(2));
    expect(firstViewer.dispose).toHaveBeenCalled();
  });
});
