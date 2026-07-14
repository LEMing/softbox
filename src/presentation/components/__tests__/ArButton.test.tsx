import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ArButton } from '../ArButton';
import {
  AR_FAILURE_HASH,
  detectArMode,
  launchQuickLook,
  launchSceneViewer,
} from '../arHandoff';

jest.mock('../arHandoff', () => ({
  ...jest.requireActual('../arHandoff'),
  detectArMode: jest.fn(),
  launchQuickLook: jest.fn(),
  launchSceneViewer: jest.fn(),
}));

const mockedDetect = detectArMode as jest.Mock;
const mockedQuickLook = launchQuickLook as jest.Mock;
const mockedSceneViewer = launchSceneViewer as jest.Mock;

const HTTPS_GLB = 'https://cdn.x/shoe.glb';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ArButton', () => {
  it('renders nothing on a device with no AR viewer (desktop)', () => {
    mockedDetect.mockReturnValue(null);
    render(<ArButton source={HTTPS_GLB} options={{ iosSrc: '/shoe.usdz' }} />);
    expect(screen.queryByTestId('viewer-ar-button')).not.toBeInTheDocument();
  });

  it('hands an iOS device off to Quick Look with the USDZ', () => {
    mockedDetect.mockReturnValue('quick-look');
    render(<ArButton source={HTTPS_GLB} options={{ iosSrc: 'https://cdn.x/shoe.usdz' }} />);

    fireEvent.click(screen.getByTestId('viewer-ar-button'));

    expect(mockedQuickLook).toHaveBeenCalledWith('https://cdn.x/shoe.usdz');
    expect(mockedSceneViewer).not.toHaveBeenCalled();
  });

  it('hides on iOS without a USDZ — Quick Look cannot read GLB', () => {
    mockedDetect.mockReturnValue('quick-look');
    render(<ArButton source={HTTPS_GLB} options={{}} />);
    expect(screen.queryByTestId('viewer-ar-button')).not.toBeInTheDocument();
  });

  it('hands an Android device off to Scene Viewer with the model URL and title', () => {
    mockedDetect.mockReturnValue('scene-viewer');
    render(<ArButton source={HTTPS_GLB} options={{ title: 'Runner' }} />);

    fireEvent.click(screen.getByTestId('viewer-ar-button'));

    expect(mockedSceneViewer).toHaveBeenCalledTimes(1);
    const intentUrl = mockedSceneViewer.mock.calls[0][0] as string;
    expect(intentUrl).toContain(`file=${encodeURIComponent(HTTPS_GLB)}`);
    expect(intentUrl).toContain('title=Runner');
  });

  it('hides on Android when the model has no fetchable URL (dropped blob)', () => {
    mockedDetect.mockReturnValue('scene-viewer');
    render(<ArButton source="blob:http://localhost/123" options={{}} />);
    expect(screen.queryByTestId('viewer-ar-button')).not.toBeInTheDocument();
  });

  it('hides on Android for a null source (object-loaded model)', () => {
    mockedDetect.mockReturnValue('scene-viewer');
    render(<ArButton source={null} options={{}} />);
    expect(screen.queryByTestId('viewer-ar-button')).not.toBeInTheDocument();
  });

  it('retires itself when the Scene Viewer fallback beacon fires (no AR on this device)', () => {
    mockedDetect.mockReturnValue('scene-viewer');
    render(<ArButton source={HTTPS_GLB} options={{}} />);
    expect(screen.getByTestId('viewer-ar-button')).toBeInTheDocument();

    act(() => {
      window.location.hash = AR_FAILURE_HASH;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(screen.queryByTestId('viewer-ar-button')).not.toBeInTheDocument();
    // The beacon hash is stripped so it cannot re-trigger or leak into URLs.
    expect(window.location.hash).toBe('');
  });

  it('floats in the configured corner and lifts clear of the preset row', () => {
    mockedDetect.mockReturnValue('scene-viewer');
    const { rerender } = render(<ArButton source={HTTPS_GLB} options={{}} />);
    expect(screen.getByTestId('viewer-ar-button')).toHaveStyle({ bottom: '16px', left: '16px' });

    rerender(<ArButton source={HTTPS_GLB} options={{}} clearPresetRow />);
    expect(screen.getByTestId('viewer-ar-button')).toHaveStyle({ bottom: '64px' });

    rerender(<ArButton source={HTTPS_GLB} options={{ placement: 'top-right' }} clearPresetRow />);
    // Top placements have nothing to clear.
    expect(screen.getByTestId('viewer-ar-button')).toHaveStyle({ top: '16px', right: '16px' });
  });
});
