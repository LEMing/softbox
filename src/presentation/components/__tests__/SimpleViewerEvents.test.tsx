import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimpleViewer } from '../SimpleViewer';
import { SimpleViewerHandle } from '../../../types';
import { useViewerCore } from '../../hooks';
import { TypedEventEmitter } from '../../../events/EventEmitter';
import { ViewerEventMap } from '../../../core/events/ViewerEvents';
import { ThreeObject3DAdapter } from '../../../infrastructure/three/ThreeObject3D';
import * as THREE from 'three';

// Keep the REAL useViewerEventHandlers (it does the forwarding under test) and
// only stub useViewerCore so we control the viewer's core event bus.
jest.mock('../../hooks', () => {
  const actual = jest.requireActual('../../hooks');
  return { ...actual, useViewerCore: jest.fn() };
});
jest.mock('threedgizmo', () => ({ Gizmo: () => null }));

const mockedUseViewerCore = useViewerCore as jest.Mock;

describe('SimpleViewer event forwarding', () => {
  it('forwards model:loading from the core bus to the public handle', async () => {
    const coreBus = new TypedEventEmitter<ViewerEventMap>();
    mockedUseViewerCore.mockReturnValue({
      viewer: {
        getEvents: () => coreBus,
        getScene: () => null,
        getCamera: () => null,
        getControls: () => null,
        getRenderer: () => null,
        requestRender: jest.fn(),
        loadModel: jest.fn(() => new Promise(() => {})),
        dispose: jest.fn(),
      },
      isInitialized: true,
    });

    const ref = React.createRef<SimpleViewerHandle>();
    render(<SimpleViewer ref={ref} object={null} />);
    await waitFor(() => expect(ref.current?.events).toBeTruthy());

    const onLoading = jest.fn();
    ref.current!.events.on('model:loading', onLoading);

    act(() => {
      coreBus.emit('model:loading', { url: 'x.glb' });
    });

    // The documented "roll your own from events" path must actually receive it.
    expect(onLoading).toHaveBeenCalledWith({ url: 'x.glb' });
  });

  it('forwards object:selected with the unwrapped object and the hit point', async () => {
    const coreBus = new TypedEventEmitter<ViewerEventMap>();
    mockedUseViewerCore.mockReturnValue({
      viewer: {
        getEvents: () => coreBus,
        getScene: () => null,
        getCamera: () => null,
        getControls: () => null,
        getRenderer: () => null,
        requestRender: jest.fn(),
        loadModel: jest.fn(() => new Promise(() => {})),
        dispose: jest.fn(),
      },
      isInitialized: true,
    });

    const ref = React.createRef<SimpleViewerHandle>();
    render(<SimpleViewer ref={ref} object={null} />);
    await waitFor(() => expect(ref.current?.events).toBeTruthy());

    const onSelected = jest.fn();
    ref.current!.events.on('object:selected', onSelected);

    const threeObject = new THREE.Object3D();
    act(() => {
      coreBus.emit('object:selected', {
        object: new ThreeObject3DAdapter(threeObject),
        point: { x: 1, y: 2, z: 3 },
      });
    });

    expect(onSelected).toHaveBeenCalledTimes(1);
    const payload = onSelected.mock.calls[0][0];
    expect(payload.object).toBe(threeObject);
    expect(payload.point).toEqual({ x: 1, y: 2, z: 3 });
  });
});
