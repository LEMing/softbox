import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as THREE from 'three';
import { Hotspot } from '../Hotspot';
import { SimpleViewer } from '../SimpleViewer';
import { ViewerProvider } from '../ViewerContext';
import { useViewerCore, useViewerEventHandlers } from '../../hooks';
import { TypedEventEmitter } from '../../../events/EventEmitter';
import { ViewerEventMap } from '../../../core/events/ViewerEvents';
import { ViewerCore } from '../../../core/ViewerCore';

jest.mock('../../hooks', () => ({
  useViewerCore: jest.fn(),
  useViewerEventHandlers: jest.fn(),
}));
jest.mock('threedgizmo', () => ({ Gizmo: () => null }));

const makeViewer = (model: THREE.Object3D | null = null) => {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  Object.defineProperty(canvas, 'clientWidth', { value: 200, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: 200, configurable: true });

  const bus = new TypedEventEmitter<ViewerEventMap>();
  const viewer = {
    getCamera: () => ({ getThreeCamera: () => camera }),
    getDomElement: () => canvas,
    getEvents: () => bus,
    getModel: () => (model ? { getThreeObject: () => model } : null),
  } as unknown as ViewerCore;

  return { viewer, camera, canvas, bus };
};

const renderHotspot = (
  viewer: ViewerCore,
  canvas: HTMLCanvasElement,
  props: React.ComponentProps<typeof Hotspot>
) =>
  render(
    <ViewerProvider viewer={viewer} canvasRef={{ current: canvas }}>
      <Hotspot {...props} />
    </ViewerProvider>
  );

describe('Hotspot', () => {
  it('projects the anchor to screen coordinates on mount', () => {
    const { viewer, canvas } = makeViewer();
    renderHotspot(viewer, canvas, { position: [0, 0, 0] });

    const hotspot = screen.getByTestId('viewer-hotspot');
    // The world origin projects to the canvas center.
    expect(hotspot.style.visibility).toBe('visible');
    expect(parseFloat(hotspot.style.left)).toBeCloseTo(100);
    expect(parseFloat(hotspot.style.top)).toBeCloseTo(100);
  });

  it('reprojects when the camera moves and a frame renders', () => {
    const { viewer, camera, canvas, bus } = makeViewer();
    renderHotspot(viewer, canvas, { position: [0, 0, 0] });

    camera.position.set(2, 0, 5);
    camera.updateMatrixWorld();
    act(() => {
      bus.emit('render:complete', { frame: 1, renderTime: 0 });
    });

    const hotspot = screen.getByTestId('viewer-hotspot');
    expect(parseFloat(hotspot.style.left)).toBeLessThan(100);
  });

  it('hides an anchor behind the camera', () => {
    const { viewer, canvas } = makeViewer();
    renderHotspot(viewer, canvas, { position: [0, 0, 10] });

    expect(screen.getByTestId('viewer-hotspot').style.visibility).toBe('hidden');
  });

  it('hides the anchor when the model occludes it (occlude on)', () => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial());
    wall.position.set(0, 0, 2);
    wall.updateMatrixWorld();
    const { viewer, canvas } = makeViewer(wall);

    renderHotspot(viewer, canvas, { position: [0, 0, 0], occlude: true });
    expect(screen.getByTestId('viewer-hotspot').style.visibility).toBe('hidden');
  });

  it('keeps a non-occluded anchor visible with occlude on', () => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial());
    wall.position.set(0, 0, -3);
    wall.updateMatrixWorld();
    const { viewer, canvas } = makeViewer(wall);

    renderHotspot(viewer, canvas, { position: [0, 0, 0], occlude: true });
    expect(screen.getByTestId('viewer-hotspot').style.visibility).toBe('visible');
  });

  it('renders custom children instead of the default pin', () => {
    const { viewer, canvas } = makeViewer();
    renderHotspot(viewer, canvas, { position: [0, 0, 0], children: <button>Engine</button> });

    expect(screen.getByRole('button', { name: 'Engine' })).toBeInTheDocument();
  });

  it('falls back to the default pin when children resolve to false', () => {
    const { viewer, canvas } = makeViewer();
    renderHotspot(viewer, canvas, { position: [0, 0, 0], children: false });

    expect(screen.getByTestId('viewer-hotspot').querySelector('span')).not.toBeNull();
  });

  it('unsubscribes from viewer events on unmount', () => {
    const { viewer, canvas, bus } = makeViewer();
    const { unmount } = renderHotspot(viewer, canvas, { position: [0, 0, 0] });
    expect(bus.listenerCount('render:complete')).toBe(1);

    unmount();

    expect(bus.listenerCount('render:complete')).toBe(0);
    expect(bus.listenerCount('controls:change')).toBe(0);
    expect(bus.listenerCount('model:loaded')).toBe(0);
  });

  it('renders as a SimpleViewer child inside the overlay container', () => {
    (useViewerCore as jest.Mock).mockReturnValue({ viewer: null, isInitialized: false });
    (useViewerEventHandlers as jest.Mock).mockImplementation(() => {});

    render(
      <SimpleViewer object={null}>
        <Hotspot position={[0, 0, 0]} />
      </SimpleViewer>
    );

    expect(screen.getByTestId('viewer-hotspot')).toBeInTheDocument();
  });
});
