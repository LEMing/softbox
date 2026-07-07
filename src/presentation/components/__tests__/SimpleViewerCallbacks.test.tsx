import React from 'react';
import { render, waitFor, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimpleViewer } from '../SimpleViewer';
import { useViewerCore } from '../../hooks';
import { TypedEventEmitter } from '../../../events/EventEmitter';
import { ViewerEventMap } from '../../../core/events/CoreViewerEvents';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { ThreeObject3DAdapter } from '../../../infrastructure/three/ThreeObject3D';
import * as THREE from 'three';

// Keep the real forwarding/callback hooks; stub only useViewerCore so the
// tests control the core event bus and the init outcome.
jest.mock('../../hooks', () => {
  const actual = jest.requireActual('../../hooks');
  return { ...actual, useViewerCore: jest.fn() };
});
jest.mock('threedgizmo', () => ({ Gizmo: () => null }));

const mockedUseViewerCore = useViewerCore as jest.Mock;

const makeViewer = (coreBus: TypedEventEmitter<ViewerEventMap>) => ({
  getEvents: () => coreBus,
  getScene: () => null,
  getCamera: () => null,
  getControls: () => null,
  getRenderer: () => null,
  requestRender: jest.fn(),
  loadModel: jest.fn(() => new Promise(() => {})),
  dispose: jest.fn(),
});

describe('SimpleViewer option callbacks', () => {
  it('invokes onLoad / onProgress / onError from the load lifecycle', async () => {
    const coreBus = new TypedEventEmitter<ViewerEventMap>();
    mockedUseViewerCore.mockReturnValue({
      viewer: makeViewer(coreBus),
      isInitialized: true,
      initError: null,
    });

    const onLoad = jest.fn();
    const onProgress = jest.fn();
    const onError = jest.fn();
    render(
      <SimpleViewer object={null} options={{ onLoad, onProgress, onError }} />
    );
    await waitFor(() => expect(mockedUseViewerCore).toHaveBeenCalled());

    const error = new ThreeViewerError('boom', ErrorCode.MODEL_LOAD_FAILED);
    act(() => {
      coreBus.emit('model:progress', { url: 'x.glb', loaded: 25, total: 100 });
      coreBus.emit('model:loaded', {
        model: new ThreeObject3DAdapter(new THREE.Object3D()),
        loadTime: 5,
      });
      coreBus.emit('model:error', { error, url: 'x.glb' });
    });

    expect(onProgress).toHaveBeenCalledWith(0.25);
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('reads the LATEST callback when the options identity churns between renders', async () => {
    const coreBus = new TypedEventEmitter<ViewerEventMap>();
    mockedUseViewerCore.mockReturnValue({
      viewer: makeViewer(coreBus),
      isInitialized: true,
      initError: null,
    });

    const staleOnLoad = jest.fn();
    const freshOnLoad = jest.fn();
    const { rerender } = render(
      <SimpleViewer object={null} options={{ onLoad: staleOnLoad }} />
    );
    rerender(<SimpleViewer object={null} options={{ onLoad: freshOnLoad }} />);

    act(() => {
      coreBus.emit('model:loaded', {
        model: new ThreeObject3DAdapter(new THREE.Object3D()),
        loadTime: 5,
      });
    });

    expect(staleOnLoad).not.toHaveBeenCalled();
    expect(freshOnLoad).toHaveBeenCalledTimes(1);
  });

  it('clamps onProgress to 1 when decompressed bytes overrun the compressed Content-Length', async () => {
    const coreBus = new TypedEventEmitter<ViewerEventMap>();
    mockedUseViewerCore.mockReturnValue({
      viewer: makeViewer(coreBus),
      isInitialized: true,
      initError: null,
    });

    const onProgress = jest.fn();
    render(<SimpleViewer object={null} options={{ onProgress }} />);
    await waitFor(() => expect(mockedUseViewerCore).toHaveBeenCalled());

    act(() => {
      coreBus.emit('model:progress', { url: 'x.glb', loaded: 320, total: 100 });
    });

    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('reports an init failure to an onError attached on a LATER render', async () => {
    const initError = new ThreeViewerError('boom', ErrorCode.INITIALIZATION_FAILED);
    mockedUseViewerCore.mockReturnValue({
      viewer: null,
      isInitialized: false,
      initError,
    });

    const { rerender } = render(<SimpleViewer object={null} options={{}} />);

    const onError = jest.fn();
    rerender(<SimpleViewer object={null} options={{ onError }} />);

    await waitFor(() => expect(onError).toHaveBeenCalledWith(initError));
    // Once per failure, not once per render.
    rerender(<SimpleViewer object={null} options={{ onError }} />);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('surfaces an init failure through onError and the overlay error state', async () => {
    const initError = new ThreeViewerError(
      'WebGL context could not be created',
      ErrorCode.INITIALIZATION_FAILED
    );
    mockedUseViewerCore.mockReturnValue({
      viewer: null,
      isInitialized: false,
      initError,
    });

    const onError = jest.fn();
    render(<SimpleViewer object="model.glb" options={{ onError }} />);

    await waitFor(() => expect(onError).toHaveBeenCalledWith(initError));
    // The spinner must not spin forever — the overlay shows the error.
    expect(screen.getByText('WebGL context could not be created')).toBeInTheDocument();
  });
});
