import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimpleViewer } from '../SimpleViewer';
import { useViewerCore, useViewerEventHandlers } from '../../hooks';
import { detectArMode } from '../arHandoff';

jest.mock('../../hooks', () => ({
  ...jest.requireActual('../../hooks'),
  useViewerCore: jest.fn(),
  useViewerEventHandlers: jest.fn(),
}));
jest.mock('threedgizmo', () => ({ Gizmo: () => null }));
jest.mock('../arHandoff', () => ({
  ...jest.requireActual('../arHandoff'),
  detectArMode: jest.fn(),
}));

const mockedUseViewerCore = useViewerCore as jest.Mock;
const mockedDetect = detectArMode as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseViewerCore.mockReturnValue({ viewer: null, isInitialized: false });
  (useViewerEventHandlers as jest.Mock).mockImplementation(() => {});
  mockedDetect.mockReturnValue('scene-viewer');
});

describe('SimpleViewer AR handoff wiring', () => {
  it('renders no AR button by default', () => {
    render(<SimpleViewer object="https://cdn.x/shoe.glb" />);
    expect(screen.queryByTestId('viewer-ar-button')).not.toBeInTheDocument();
  });

  it('renders the button for `ar: true` with a URL-loaded model', () => {
    render(<SimpleViewer object="https://cdn.x/shoe.glb" options={{ ar: true }} />);
    expect(screen.getByTestId('viewer-ar-button')).toBeInTheDocument();
  });

  it('accepts the object form and hides where the device cannot hand off', () => {
    mockedDetect.mockReturnValue(null);
    render(
      <SimpleViewer
        object="https://cdn.x/shoe.glb"
        options={{ ar: { iosSrc: 'https://cdn.x/shoe.usdz' } }}
      />
    );
    expect(screen.queryByTestId('viewer-ar-button')).not.toBeInTheDocument();
  });
});
