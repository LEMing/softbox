import React, { createRef } from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimpleViewer } from '../SimpleViewer';
import { useViewerCore, useViewerEventHandlers } from '../../hooks';
import { SimpleViewerHandle } from '../../../types';
import { Result } from '../../../utils/Result';
import { TypedEventEmitter } from '../../../events/EventEmitter';
import { ThreeViewerError, ErrorCode } from '../../../errors';

jest.mock('../../hooks', () => ({
  ...jest.requireActual('../../hooks'),
  useViewerCore: jest.fn(),
  useViewerEventHandlers: jest.fn(),
}));
jest.mock('threedgizmo', () => ({ Gizmo: () => null }));

const mockedUseViewerCore = useViewerCore as jest.Mock;

const makeViewer = (playAnimations: jest.Mock) => ({
  getScene: jest.fn(() => null),
  getCamera: jest.fn(() => null),
  getRenderer: jest.fn(() => null),
  getControls: jest.fn(() => null),
  getEvents: jest.fn(() => new TypedEventEmitter()),
  requestRender: jest.fn(),
  loadModel: jest.fn(async () => Result.ok(undefined)),
  playAnimations,
  dispose: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  (useViewerEventHandlers as jest.Mock).mockImplementation(() => {});
});

describe('SimpleViewerHandle.playAnimations', () => {
  it('forwards the clip name and returns silently on success', () => {
    const playAnimations = jest.fn(() => Result.ok(undefined));
    mockedUseViewerCore.mockReturnValue({ viewer: makeViewer(playAnimations), isInitialized: true });

    const ref = createRef<SimpleViewerHandle>();
    render(<SimpleViewer ref={ref} object={null} />);

    expect(() => ref.current!.playAnimations('Walk')).not.toThrow();
    expect(playAnimations).toHaveBeenCalledWith('Walk');
  });

  it('throws the viewer error on an unknown clip name', () => {
    const error = new ThreeViewerError(
      "Unknown animation clip 'Nope'. Available clips: Walk",
      ErrorCode.INVALID_PARAMETER
    );
    const playAnimations = jest.fn(() => Result.err(error));
    mockedUseViewerCore.mockReturnValue({ viewer: makeViewer(playAnimations), isInitialized: true });

    const ref = createRef<SimpleViewerHandle>();
    render(<SimpleViewer ref={ref} object={null} />);

    expect(() => ref.current!.playAnimations('Nope')).toThrow(error);
  });

  it('throws when the viewer is not ready yet', () => {
    mockedUseViewerCore.mockReturnValue({ viewer: null, isInitialized: false });

    const ref = createRef<SimpleViewerHandle>();
    render(<SimpleViewer ref={ref} object={null} />);

    expect(() => ref.current!.playAnimations()).toThrow('Viewer is not ready');
  });
});
