import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SiteApp } from '../SiteApp';

jest.mock('../../SimpleViewerWrapper', () => ({
  __esModule: true,
  default: ({ object }: { object?: string }) => (
    <div data-testid="viewer" data-object={String(object)} />
  ),
}));

const viewerObject = () => screen.getByTestId('viewer').getAttribute('data-object');

const DROPPED_CHIP = 'yours';

const dropFile = (name: string) => {
  const event = new Event('drop', { cancelable: true }) as Event & {
    dataTransfer: { types: string[]; files: File[] };
  };
  event.dataTransfer = { types: ['Files'], files: [new File(['x'], name)] };
  act(() => {
    window.dispatchEvent(event);
  });
};

beforeEach(() => {
  let counter = 0;
  global.URL.createObjectURL = jest.fn(() => `blob:mock-${++counter}`);
  global.URL.revokeObjectURL = jest.fn();
});

describe('SiteApp', () => {
  it('shows the sample models and starts on the Lantern', () => {
    render(<SiteApp />);
    expect(screen.getByText('Lantern')).toBeInTheDocument();
    expect(viewerObject()).toContain('Lantern.glb');
  });

  it('switches the viewer to the picked sample model', () => {
    render(<SiteApp />);
    fireEvent.click(screen.getByText('Helmet'));
    expect(viewerObject()).toContain('DamagedHelmet.glb');
  });

  it('puts a dropped model on stage and adds its chip', () => {
    render(<SiteApp />);
    dropFile('rocket.glb');
    expect(viewerObject()).toBe('blob:mock-1');
    expect(screen.getByText(DROPPED_CHIP)).toHaveAttribute('aria-pressed', 'true');
  });

  it('lets the user return from the dropped model to a sample', () => {
    render(<SiteApp />);
    dropFile('rocket.glb');
    fireEvent.click(screen.getByText('Avocado'));
    expect(viewerObject()).toContain('Avocado.glb');
    expect(screen.getByText(DROPPED_CHIP)).toBeInTheDocument();
  });

  it('loads a model chosen via the browse file input', () => {
    render(<SiteApp />);
    const input = screen.getByLabelText('Choose a .glb model file');
    fireEvent.change(input, { target: { files: [new File(['x'], 'chosen.glb')] } });
    expect(viewerObject()).toBe('blob:mock-1');
  });

  it('shows a notice instead of loading an unsupported file', () => {
    render(<SiteApp />);
    dropFile('scene.gltf');
    expect(screen.getByText(/Only self-contained/)).toBeInTheDocument();
    expect(viewerObject()).toContain('Lantern.glb');
  });
});
