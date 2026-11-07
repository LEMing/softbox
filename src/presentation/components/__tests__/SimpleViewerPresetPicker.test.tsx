import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimpleViewer } from '../SimpleViewer';
import { useViewerCore, useViewerEventHandlers } from '../../hooks';
import { SimpleViewerOptions } from '../../../types/SimpleViewerOptions';

jest.mock('../../hooks', () => ({
  ...jest.requireActual('../../hooks'),
  useViewerCore: jest.fn(),
  useViewerEventHandlers: jest.fn(),
}));
jest.mock('threedgizmo', () => ({ Gizmo: () => null }));

const mockedUseViewerCore = useViewerCore as jest.Mock;

const lastOptionsPassedToCore = (): SimpleViewerOptions => {
  const calls = mockedUseViewerCore.mock.calls;
  return calls[calls.length - 1][1] as SimpleViewerOptions;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseViewerCore.mockReturnValue({ viewer: null, isInitialized: false });
  (useViewerEventHandlers as jest.Mock).mockImplementation(() => {});
});

describe('SimpleViewer built-in preset picker', () => {
  it('renders no picker by default', () => {
    render(<SimpleViewer object={null} />);
    expect(screen.queryByTestId('viewer-preset-picker')).not.toBeInTheDocument();
  });

  it('renders the picker when ui.presets is enabled', () => {
    render(<SimpleViewer object={null} options={{ ui: { presets: true } }} />);
    expect(screen.getByTestId('viewer-preset-picker')).toBeInTheDocument();
  });

  it('shows studio as active when no preset is set (the defaults are the studio look)', () => {
    render(<SimpleViewer object={null} options={{ ui: { presets: true } }} />);
    expect(screen.getByText('studio')).toHaveAttribute('aria-pressed', 'true');
  });

  it('folds a picked preset into the options passed to the core', () => {
    render(<SimpleViewer object={null} options={{ ui: { presets: true } }} />);
    fireEvent.click(screen.getByText('dark'));
    expect(lastOptionsPassedToCore().preset).toBe('dark');
    expect(screen.getByText('dark')).toHaveAttribute('aria-pressed', 'true');
  });

  it('notifies ui.onPresetChange when a chip is picked', () => {
    const onPresetChange = jest.fn();
    render(
      <SimpleViewer object={null} options={{ ui: { presets: true, onPresetChange } }} />
    );
    fireEvent.click(screen.getByText('outdoor'));
    expect(onPresetChange).toHaveBeenCalledTimes(1);
    expect(onPresetChange).toHaveBeenCalledWith('outdoor');
  });

  it('lets a picked preset override the consumer preset until the consumer changes theirs', () => {
    const { rerender } = render(
      <SimpleViewer object={null} preset="studio" options={{ ui: { presets: true } }} />
    );
    fireEvent.click(screen.getByText('dark'));
    expect(lastOptionsPassedToCore().preset).toBe('dark');

    rerender(
      <SimpleViewer object={null} preset="product" options={{ ui: { presets: true } }} />
    );
    expect(lastOptionsPassedToCore().preset).toBe('product');
    expect(screen.getByText('product')).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the picked preset when the consumer re-renders with the same preset', () => {
    const { rerender } = render(
      <SimpleViewer object={null} preset="studio" options={{ ui: { presets: true } }} />
    );
    fireEvent.click(screen.getByText('dark'));

    rerender(
      <SimpleViewer object={null} preset="studio" options={{ ui: { presets: true } }} />
    );
    expect(lastOptionsPassedToCore().preset).toBe('dark');
  });

  it('renders no picker when ui.presets is explicitly false', () => {
    render(<SimpleViewer object={null} options={{ ui: { presets: false } }} />);
    expect(screen.queryByTestId('viewer-preset-picker')).not.toBeInTheDocument();
  });

  it('clears the picked preset when the picker is turned off', () => {
    const { rerender } = render(
      <SimpleViewer object={null} preset="studio" options={{ ui: { presets: true } }} />
    );
    fireEvent.click(screen.getByText('dark'));
    expect(lastOptionsPassedToCore().preset).toBe('dark');

    rerender(
      <SimpleViewer object={null} preset="studio" options={{ ui: { presets: false } }} />
    );
    expect(screen.queryByTestId('viewer-preset-picker')).not.toBeInTheDocument();
    expect(lastOptionsPassedToCore().preset).toBe('studio');
  });

  it('does not let an async echo of an older pick revert a newer pick', () => {
    const onPresetChange = jest.fn();
    const { rerender } = render(
      <SimpleViewer
        object={null}
        preset="studio"
        options={{ ui: { presets: true, onPresetChange } }}
      />
    );

    // Two quick picks; the consumer persists asynchronously, so the echo of
    // the FIRST pick arrives in the preset prop after the second pick.
    fireEvent.click(screen.getByText('dark'));
    fireEvent.click(screen.getByText('outdoor'));
    rerender(
      <SimpleViewer
        object={null}
        preset="dark"
        options={{ ui: { presets: true, onPresetChange } }}
      />
    );
    expect(lastOptionsPassedToCore().preset).toBe('outdoor');

    // The echo of the newer pick hands control back to the consumer.
    rerender(
      <SimpleViewer
        object={null}
        preset="outdoor"
        options={{ ui: { presets: true, onPresetChange } }}
      />
    );
    expect(lastOptionsPassedToCore().preset).toBe('outdoor');

    // A genuine consumer change afterwards still wins.
    rerender(
      <SimpleViewer
        object={null}
        preset="neutral"
        options={{ ui: { presets: true, onPresetChange } }}
      />
    );
    expect(lastOptionsPassedToCore().preset).toBe('neutral');
  });
});
