import { renderHook, waitFor } from '@testing-library/react';
import { useModelLoader } from '../useModelLoader';
import { ViewerCore } from '../../../core/ViewerCore';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';

const makeViewer = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    loadModel: jest.fn(() => Promise.resolve(Result.ok(undefined))),
    isDisposed: jest.fn(() => false),
    ...overrides,
  }) as unknown as ViewerCore;

describe('useModelLoader', () => {
  it('loads the object once the viewer is initialized', async () => {
    const viewer = makeViewer();
    const { result } = renderHook(() => useModelLoader(viewer, true, '/model.glb'));
    await waitFor(() => expect(viewer.loadModel).toHaveBeenCalledWith('/model.glb'));
    await waitFor(() => expect(result.current.status).toBe('loaded'));
  });

  it('does nothing until the viewer is initialized', () => {
    const viewer = makeViewer();
    renderHook(() => useModelLoader(viewer, false, '/model.glb'));
    expect(viewer.loadModel).not.toHaveBeenCalled();
  });

  it('skips a viewer disposed by a structural rebuild (no load, no error surfaced)', () => {
    // The rebuild disposes the previous viewer in the same commit this effect
    // runs with; loading into it would surface a benign "after dispose" error.
    const viewer = makeViewer({ isDisposed: jest.fn(() => true) });
    const { result } = renderHook(() => useModelLoader(viewer, true, '/model.glb'));
    expect(viewer.loadModel).not.toHaveBeenCalled();
    expect(result.current.status).not.toBe('error');
  });

  it('does not surface an error when the viewer is disposed mid-load', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let resolveLoad!: (value: Result<void>) => void;
    const isDisposed = jest.fn(() => false);
    const viewer = makeViewer({
      isDisposed,
      loadModel: jest.fn(() => new Promise<Result<void>>((resolve) => { resolveLoad = resolve; })),
    });
    const { result } = renderHook(() => useModelLoader(viewer, true, '/model.glb'));
    await waitFor(() => expect(viewer.loadModel).toHaveBeenCalled());

    // The rebuild tears the viewer down while the load is in flight, then the
    // load rejects with the dispose guard — it must not become a user-facing error.
    isDisposed.mockReturnValue(true);
    resolveLoad(Result.err(new ThreeViewerError('Cannot load model after dispose', ErrorCode.INVALID_STATE)));
    await Promise.resolve();

    expect(result.current.status).not.toBe('error');
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
