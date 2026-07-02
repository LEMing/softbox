import React, { createRef } from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimpleViewer } from '../SimpleViewer';
import { useViewerCore, useViewerEventHandlers } from '../../hooks';
import { SimpleViewerHandle } from '../../../types';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';

jest.mock('../../hooks', () => ({
  useViewerCore: jest.fn(),
  useViewerEventHandlers: jest.fn(),
}));
jest.mock('threedgizmo', () => ({ Gizmo: () => null }));

const mockedUseViewerCore = useViewerCore as jest.Mock;

const makeViewer = (captureStill: jest.Mock) => ({
  getScene: jest.fn(() => null),
  getCamera: jest.fn(() => null),
  getRenderer: jest.fn(() => null),
  getControls: jest.fn(() => null),
  requestRender: jest.fn(),
  loadModel: jest.fn(async () => Result.ok(undefined)),
  captureStill,
  dispose: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  (useViewerEventHandlers as jest.Mock).mockImplementation(() => {});
});

describe('SimpleViewerHandle.captureStill', () => {
  it('forwards the options and unwraps the data URL', async () => {
    const captureStill = jest.fn(async () => Result.ok('data:image/png;base64,x'));
    mockedUseViewerCore.mockReturnValue({ viewer: makeViewer(captureStill), isInitialized: true });

    const ref = createRef<SimpleViewerHandle>();
    render(<SimpleViewer ref={ref} object={null} />);

    await expect(ref.current!.captureStill({ width: 64 })).resolves.toBe(
      'data:image/png;base64,x'
    );
    expect(captureStill).toHaveBeenCalledWith({ width: 64 });
  });

  it('throws the viewer error when the capture fails', async () => {
    const error = new ThreeViewerError('nope', ErrorCode.INVALID_PARAMETER);
    const captureStill = jest.fn(async () => Result.err(error));
    mockedUseViewerCore.mockReturnValue({ viewer: makeViewer(captureStill), isInitialized: true });

    const ref = createRef<SimpleViewerHandle>();
    render(<SimpleViewer ref={ref} object={null} />);

    await expect(ref.current!.captureStill()).rejects.toBe(error);
  });

  it('throws when the viewer is not ready yet', async () => {
    mockedUseViewerCore.mockReturnValue({ viewer: null, isInitialized: false });

    const ref = createRef<SimpleViewerHandle>();
    render(<SimpleViewer ref={ref} object={null} />);

    await expect(ref.current!.captureStill()).rejects.toThrow('Viewer is not ready');
  });
});
