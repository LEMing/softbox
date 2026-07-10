import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimpleViewer } from '../SimpleViewer';
import { useViewerCore, useViewerEventHandlers } from '../../hooks';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { TypedEventEmitter } from '../../../events/EventEmitter';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

jest.mock('../../hooks', () => ({
  ...jest.requireActual('../../hooks'),
  useViewerCore: jest.fn(),
  useViewerEventHandlers: jest.fn(),
}));

jest.mock('threedgizmo', () => ({ Gizmo: () => null }));

const mockedUseViewerCore = useViewerCore as jest.Mock;

const makeViewer = (loadModel: jest.Mock) =>
  ({
    getScene: () => null,
    getCamera: () => null,
    getControls: () => null,
    getRenderer: () => null,
    getEvents: () => new TypedEventEmitter(),
    requestRender: jest.fn(),
    loadModel,
    isDisposed: jest.fn(() => false),
    dispose: jest.fn(),
  }) as unknown as ReturnType<typeof useViewerCore>['viewer'];

const arrange = (loadModel: jest.Mock) => {
  mockedUseViewerCore.mockReturnValue({ viewer: makeViewer(loadModel), isInitialized: true });
};

beforeEach(() => {
  jest.clearAllMocks();
  (useViewerEventHandlers as jest.Mock).mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('SimpleViewer loading overlay', () => {
  it('shows the overlay while a model is loading', () => {
    arrange(jest.fn(() => new Promise(() => {}))); // never resolves
    const { getByTestId } = render(<SimpleViewer object="model.glb" />);
    expect(getByTestId('viewer-loading-overlay')).toHaveAttribute('aria-busy', 'true');
  });

  it('hides the overlay once the model has loaded', async () => {
    arrange(jest.fn(async () => Result.ok(undefined)));
    const { queryByTestId } = render(<SimpleViewer object="model.glb" />);
    await waitFor(() => expect(queryByTestId('viewer-loading-overlay')).toBeNull());
  });

  it('shows an error overlay when loading fails', async () => {
    arrange(jest.fn(async () => Result.err(new ThreeViewerError('boom', ErrorCode.MODEL_LOAD_FAILED))));
    const { findByTestId, getByText } = render(<SimpleViewer object="model.glb" />);
    const overlay = await findByTestId('viewer-loading-overlay');
    expect(overlay).toHaveAttribute('aria-busy', 'false');
    expect(getByText('boom')).toBeInTheDocument();
  });

  it('renders no overlay when loadingIndicator is false', () => {
    arrange(jest.fn(() => new Promise(() => {})));
    const { queryByTestId } = render(
      <SimpleViewer object="model.glb" options={{ loadingIndicator: false }} />
    );
    expect(queryByTestId('viewer-loading-overlay')).toBeNull();
  });

  it('renders no overlay when no object is provided', () => {
    arrange(jest.fn());
    const { queryByTestId } = render(<SimpleViewer object={null} />);
    expect(queryByTestId('viewer-loading-overlay')).toBeNull();
  });

  it('ignores a superseded load when the object changes mid-load', async () => {
    const first = deferred<Result<void>>();
    const second = deferred<Result<void>>();
    const loadModel = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    arrange(loadModel);

    const { rerender, queryByTestId } = render(<SimpleViewer object="a.glb" />);
    expect(queryByTestId('viewer-loading-overlay')).toBeTruthy();

    // Swap to a new model before the first load resolves.
    rerender(<SimpleViewer object="b.glb" />);

    // The first (now superseded) load resolving must NOT hide the overlay.
    await act(async () => {
      first.resolve(Result.ok(undefined));
    });
    expect(queryByTestId('viewer-loading-overlay')).toBeTruthy();

    // The current load resolving does.
    await act(async () => {
      second.resolve(Result.ok(undefined));
    });
    await waitFor(() => expect(queryByTestId('viewer-loading-overlay')).toBeNull());
  });

  it('re-shows the overlay when a second model loads after a successful one', async () => {
    const second = deferred<Result<void>>();
    const loadModel = jest
      .fn()
      .mockReturnValueOnce(Promise.resolve(Result.ok(undefined)))
      .mockReturnValueOnce(second.promise);
    arrange(loadModel);

    const { rerender, queryByTestId } = render(<SimpleViewer object="a.glb" />);
    await waitFor(() => expect(queryByTestId('viewer-loading-overlay')).toBeNull());

    rerender(<SimpleViewer object="b.glb" />);
    expect(queryByTestId('viewer-loading-overlay')).toHaveAttribute('aria-busy', 'true');
  });

  it('prefers a custom errorLabel over the raw error message', async () => {
    arrange(jest.fn(async () => Result.err(new ThreeViewerError('raw boom', ErrorCode.MODEL_LOAD_FAILED))));
    const { findByText, queryByText } = render(
      <SimpleViewer object="m.glb" options={{ loadingIndicator: { errorLabel: 'Could not load' } }} />
    );
    expect(await findByText('Could not load')).toBeInTheDocument();
    expect(queryByText('raw boom')).toBeNull();
  });
});
