import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimpleViewer } from '../SimpleViewer';
import { useViewerCore, useViewerEventHandlers } from '../../hooks';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';

jest.mock('../../hooks', () => ({
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
    requestRender: jest.fn(),
    loadModel,
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
});
