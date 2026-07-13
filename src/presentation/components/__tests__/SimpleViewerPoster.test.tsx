import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as THREE from 'three';
import { SimpleViewer } from '../SimpleViewer';
import { useViewerCore } from '../../hooks';
import { TypedEventEmitter } from '../../../events/EventEmitter';
import { ViewerEventMap } from '../../../core/events/CoreViewerEvents';
import { ThreeObject3DAdapter } from '../../../infrastructure/three/ThreeObject3D';
import { Result } from '../../../utils/Result';

jest.mock('../../hooks', () => ({
  ...jest.requireActual('../../hooks'),
  useViewerCore: jest.fn(),
}));
jest.mock('threedgizmo', () => ({ Gizmo: () => null }));

const mockedUseViewerCore = useViewerCore as jest.Mock;

let coreEvents: TypedEventEmitter<ViewerEventMap>;

const makeViewer = () =>
  ({
    getScene: () => null,
    getModelUrl: () => null,
    getCamera: () => null,
    getControls: () => null,
    getRenderer: () => null,
    getEvents: () => coreEvents,
    requestRender: jest.fn(),
    loadModel: jest.fn(async () => Result.ok(undefined)),
    isDisposed: jest.fn(() => false),
    dispose: jest.fn(),
  }) as unknown as ReturnType<typeof useViewerCore>['viewer'];

beforeEach(() => {
  jest.clearAllMocks();
  coreEvents = new TypedEventEmitter();
  mockedUseViewerCore.mockReturnValue({ viewer: makeViewer(), isInitialized: true });
});

const emitLoaded = () =>
  act(() => {
    coreEvents.emit('model:loaded', {
      model: new ThreeObject3DAdapter(new THREE.Object3D()) as never,
      loadTime: 1,
    });
  });

const emitRendered = () =>
  act(() => {
    coreEvents.emit('render:complete', { frameTime: 16 } as never);
  });

const poster = () => screen.queryByTestId('viewer-poster');

describe('SimpleViewer poster', () => {
  it('renders no poster by default', () => {
    render(<SimpleViewer object="model.glb" options={{ loadingIndicator: false }} />);
    expect(poster()).not.toBeInTheDocument();
  });

  it('shows the poster before anything paints (the lazy/booting first paint)', () => {
    render(
      <SimpleViewer
        object="model.glb"
        options={{ poster: '/hero.webp', loadingIndicator: false }}
      />
    );
    expect(poster()).toBeVisible();
    expect(poster()).toHaveAttribute('src', '/hero.webp');
    expect(poster()).toHaveStyle({ opacity: '1' });
  });

  it('keeps the poster up through model:loaded and drops it on the first PAINTED frame', () => {
    render(
      <SimpleViewer
        object="model.glb"
        options={{ poster: '/hero.webp', loadingIndicator: false }}
      />
    );

    // Renders of the empty stage must not dismiss anything.
    emitRendered();
    expect(poster()).toHaveStyle({ opacity: '1' });

    // The model landed but has not painted yet — dropping now would flash.
    emitLoaded();
    expect(poster()).toHaveStyle({ opacity: '1' });

    // First paint with the model on stage: fade out, then self-remove.
    emitRendered();
    expect(poster()).toHaveStyle({ opacity: '0' });
    fireEvent.transitionEnd(poster()!);
    expect(poster()).not.toBeInTheDocument();
  });

  it('leaves the poster up as the backdrop when the load errs', () => {
    render(
      <SimpleViewer
        object="model.glb"
        options={{ poster: '/hero.webp', loadingIndicator: false }}
      />
    );

    act(() => {
      coreEvents.emit('model:error', { error: new Error('404') as never, url: 'model.glb' });
    });
    emitRendered();

    expect(poster()).toHaveStyle({ opacity: '1' });
  });

  it('never fades back in: a poster dismissed once stays dismissed on later loads', () => {
    render(
      <SimpleViewer
        object="model.glb"
        options={{ poster: '/hero.webp', loadingIndicator: false }}
      />
    );
    emitLoaded();
    emitRendered();
    fireEvent.transitionEnd(poster()!);
    expect(poster()).not.toBeInTheDocument();

    emitLoaded();
    emitRendered();
    expect(poster()).not.toBeInTheDocument();
  });
});
