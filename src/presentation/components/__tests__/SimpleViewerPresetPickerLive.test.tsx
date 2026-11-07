import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimpleViewer } from '../SimpleViewer';
import { ViewerFactory } from '../../../infrastructure/factories/ViewerFactory';
import { Result } from '../../../utils/Result';

jest.mock('../../../infrastructure/factories/ViewerFactory');
jest.mock('threedgizmo', () => ({ Gizmo: () => null }));

interface FakeViewer {
  initialize: jest.Mock;
  updateOptions: jest.Mock;
  resize: jest.Mock;
  dispose: jest.Mock;
  getEvents: jest.Mock;
  getCamera: jest.Mock;
  getControls: jest.Mock;
  getRenderer: jest.Mock;
  getScene: jest.Mock;
  getModelUrl: () => null;
  requestRender: jest.Mock;
}

describe('SimpleViewer preset picker (real hooks, live-apply seam)', () => {
  let createdViewers: FakeViewer[];

  const makeViewer = (): FakeViewer => {
    const viewer: FakeViewer = {
      initialize: jest.fn().mockResolvedValue(Result.ok(undefined)),
      updateOptions: jest.fn(),
      resize: jest.fn(),
      dispose: jest.fn(),
      getEvents: jest.fn(() => ({ on: jest.fn(), off: jest.fn() })),
      getCamera: jest.fn(() => null),
      getControls: jest.fn(() => null),
      getRenderer: jest.fn(() => null),
      getScene: jest.fn(() => null),
    getModelUrl: () => null,
      requestRender: jest.fn(),
    };
    createdViewers.push(viewer);
    return viewer;
  };

  beforeEach(() => {
    createdViewers = [];
    (ViewerFactory.createViewer as unknown as jest.Mock) = jest.fn(makeViewer);
    global.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    }));
  });

  it('applies a picked preset live via updateOptions without rebuilding the viewer', async () => {
    render(<SimpleViewer object={null} options={{ ui: { presets: true } }} />);

    // The runtime-look effect fires once after initialization.
    await waitFor(() => expect(createdViewers[0].updateOptions).toHaveBeenCalled());
    const viewer = createdViewers[0];
    viewer.updateOptions.mockClear();

    fireEvent.click(screen.getByText('dark'));

    await waitFor(() =>
      expect(viewer.updateOptions).toHaveBeenCalledWith(
        expect.objectContaining({ backgroundColor: '#242430', backgroundColorEdge: '#050507' })
      )
    );
    expect(ViewerFactory.createViewer).toHaveBeenCalledTimes(1);
    expect(viewer.dispose).not.toHaveBeenCalled();
  });
});
