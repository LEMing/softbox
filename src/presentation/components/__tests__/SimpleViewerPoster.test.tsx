import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as THREE from 'three';
import { SimpleViewer } from '../SimpleViewer';
import { useViewerCore } from '../../hooks';
import { TypedEventEmitter } from '../../../events/EventEmitter';
import { ViewerEventMap } from '../../../core/events/CoreViewerEvents';
import { ThreeObject3DAdapter } from '../../../infrastructure/three/ThreeObject3D';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';

jest.mock('../../hooks', () => ({
  ...jest.requireActual('../../hooks'),
  useViewerCore: jest.fn(),
}));
jest.mock('threedgizmo', () => ({ Gizmo: () => null }));

const mockedUseViewerCore = useViewerCore as jest.Mock;

let coreEvents: TypedEventEmitter<ViewerEventMap>;

// The default fake load never settles, so loadState sits in 'loading' and
// dismissal is driven purely by the emitted events — like a real slow GLB.
const makeViewer = (loadModel: jest.Mock = jest.fn(() => new Promise(() => {}))) =>
  ({
    getScene: () => null,
    getModelUrl: () => null,
    getCamera: () => null,
    getControls: () => null,
    getRenderer: () => null,
    getEvents: () => coreEvents,
    requestRender: jest.fn(),
    loadModel,
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

  it('blocks input while opaque and releases it during the fade', () => {
    render(
      <SimpleViewer
        object="model.glb"
        options={{ poster: '/hero.webp', loadingIndicator: false }}
      />
    );
    // Opaque poster: the chrome underneath is invisible — taps must not
    // reach it.
    expect(poster()).toHaveStyle({ pointerEvents: 'auto' });

    emitLoaded();
    emitRendered();
    expect(poster()).toHaveStyle({ pointerEvents: 'none' });
  });

  it('stays up as the backdrop under the built-in error overlay when the load errs', async () => {
    const failingLoad = jest.fn(async () =>
      Result.err(new ThreeViewerError('404', ErrorCode.MODEL_LOAD_FAILED))
    );
    mockedUseViewerCore.mockReturnValue({ viewer: makeViewer(failingLoad), isInitialized: true });

    render(<SimpleViewer object="model.glb" options={{ poster: '/hero.webp' }} />);
    await waitFor(() => expect(screen.getByTestId('viewer-loading-overlay')).toBeInTheDocument());

    expect(poster()).toHaveStyle({ opacity: '1' });
  });

  it('steps aside on error when the built-in overlay is disabled (no frozen-hero mirage)', async () => {
    const failingLoad = jest.fn(async () =>
      Result.err(new ThreeViewerError('404', ErrorCode.MODEL_LOAD_FAILED))
    );
    mockedUseViewerCore.mockReturnValue({ viewer: makeViewer(failingLoad), isInitialized: true });

    render(
      <SimpleViewer
        object="model.glb"
        options={{ poster: '/hero.webp', loadingIndicator: false }}
      />
    );

    await waitFor(() => expect(poster()).toHaveStyle({ opacity: '0' }));
  });

  it('dismisses a poster that arrives after the model already painted', async () => {
    jest.useFakeTimers();
    const instantLoad = jest.fn(async () => Result.ok(undefined));
    mockedUseViewerCore.mockReturnValue({ viewer: makeViewer(instantLoad), isInitialized: true });

    const { rerender } = render(
      <SimpleViewer object="model.glb" options={{ loadingIndicator: false }} />
    );
    // The load settles; there will be no future model:loaded to wait for.
    await act(async () => {
      await Promise.resolve();
    });

    rerender(
      <SimpleViewer
        object="model.glb"
        options={{ poster: '/late.webp', loadingIndicator: false }}
      />
    );

    // Already-painted model: the poster must not cover it...
    expect(poster()).toHaveStyle({ opacity: '0' });
    // ...and the hidden overlay must self-remove even though no CSS
    // transition ever ran (the transitionend-less mount path).
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(poster()).not.toBeInTheDocument();
    jest.useRealTimers();
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
