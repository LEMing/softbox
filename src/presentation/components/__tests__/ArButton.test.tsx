import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ArButton } from '../ArButton';
import {
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ArButton', () => {
  it('renders nothing on a device with no AR viewer (desktop)', () => {
    mockedDetect.mockReturnValue(null);
    render(<ArButton source="/shoe.glb" options={{ iosSrc: '/shoe.usdz' }} />);
    expect(screen.queryByTestId('viewer-ar-button')).not.toBeInTheDocument();
  });

  it('hands an iOS device off to Quick Look with the USDZ', () => {
    mockedDetect.mockReturnValue('quick-look');
    render(<ArButton source="/shoe.glb" options={{ iosSrc: 'https://cdn.x/shoe.usdz' }} />);

    fireEvent.click(screen.getByTestId('viewer-ar-button'));

    expect(mockedQuickLook).toHaveBeenCalledWith('https://cdn.x/shoe.usdz');
    expect(mockedSceneViewer).not.toHaveBeenCalled();
  });

  it('hides on iOS without a USDZ — Quick Look cannot read GLB', () => {
    mockedDetect.mockReturnValue('quick-look');
    render(<ArButton source="/shoe.glb" options={{}} />);
    expect(screen.queryByTestId('viewer-ar-button')).not.toBeInTheDocument();
  });

  it('hands an Android device off to Scene Viewer with the model URL and title', () => {
    mockedDetect.mockReturnValue('scene-viewer');
    render(<ArButton source="https://cdn.x/shoe.glb" options={{ title: 'Runner' }} />);

    fireEvent.click(screen.getByTestId('viewer-ar-button'));

    expect(mockedSceneViewer).toHaveBeenCalledTimes(1);
    const intentUrl = mockedSceneViewer.mock.calls[0][0] as string;
    expect(intentUrl).toContain(`file=${encodeURIComponent('https://cdn.x/shoe.glb')}`);
    expect(intentUrl).toContain('title=Runner');
  });

  it('hides on Android when the model has no fetchable URL (dropped blob)', () => {
    mockedDetect.mockReturnValue('scene-viewer');
    render(<ArButton source="blob:http://localhost/123" options={{}} />);
    expect(screen.queryByTestId('viewer-ar-button')).not.toBeInTheDocument();
  });

  it('hides on Android for an Object3D source', () => {
    mockedDetect.mockReturnValue('scene-viewer');
    render(<ArButton source={{ isObject3D: true }} options={{}} />);
    expect(screen.queryByTestId('viewer-ar-button')).not.toBeInTheDocument();
  });
});
