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
});
