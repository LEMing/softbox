import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SiteApp } from '../SiteApp';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { ViewerEventMap } from '../../events/ViewerEvents';

jest.mock('../../SimpleViewerWrapper', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { TypedEventEmitter: Emitter } = jest.requireActual('../../events/EventEmitter');
  const events = new Emitter();
  const captureStill = jest.fn();
  const MockViewer = ReactActual.forwardRef(
    (
      {
        object,
        turntable,
        animations,
        children,
      }: {
        object?: string;
        turntable?: boolean;
        animations?: boolean;
        children?: React.ReactNode;
      },
      ref: React.Ref<unknown>
    ) => {
      ReactActual.useImperativeHandle(ref, () => ({ events, captureStill }));
      return ReactActual.createElement(
        'div',
        {
          'data-testid': 'viewer',
          'data-object': String(object),
          'data-turntable': String(turntable ?? false),
          'data-animations': String(animations ?? false),
        },
        children
      );
    }
  );
  MockViewer.displayName = 'MockSimpleViewer';
  return { __esModule: true, default: MockViewer, __events: events, __captureStill: captureStill };
});

jest.mock('../../presentation/components/Hotspot', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    Hotspot: ({ children }: { children?: React.ReactNode }) =>
      ReactActual.createElement('div', { 'data-testid': 'site-pin' }, children),
  };
});

const viewerMock = jest.requireMock('../../SimpleViewerWrapper') as {
  __events: TypedEventEmitter<ViewerEventMap>;
  __captureStill: jest.Mock;
};

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

const clickModel = (point = { x: 1, y: 2, z: 3 }) => {
  act(() => {
    viewerMock.__events.emit('object:selected', { object: {} as never, point });
  });
};

beforeAll(() => {
  // jsdom has no matchMedia; pretend every query matches so the media-gated
  // chrome (snippet, still button) renders.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  });
});

beforeEach(() => {
  let counter = 0;
  global.URL.createObjectURL = jest.fn(() => `blob:mock-${++counter}`);
  global.URL.revokeObjectURL = jest.fn();
  viewerMock.__captureStill.mockReset();
});

describe('SiteApp', () => {
  it('shows the sample models and starts on the Motorhome', () => {
    render(<SiteApp />);
    expect(screen.getByText('Lantern')).toBeInTheDocument();
    expect(viewerObject()).toContain('motorhome.glb');
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
    expect(viewerObject()).toContain('motorhome.glb');
  });
});

describe('SiteApp hotspot pins', () => {
  it('pins a numbered hotspot where the model was clicked', () => {
    render(<SiteApp />);
    clickModel();
    expect(screen.getAllByTestId('site-pin')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Remove hotspot 1' })).toBeInTheDocument();

    clickModel({ x: 0, y: 1, z: 0 });
    expect(screen.getAllByTestId('site-pin')).toHaveLength(2);
  });

  it('removes a pin when it is clicked', () => {
    render(<SiteApp />);
    clickModel();
    fireEvent.click(screen.getByRole('button', { name: 'Remove hotspot 1' }));
    expect(screen.queryByTestId('site-pin')).not.toBeInTheDocument();
  });

  it('clears the pins when the model changes', () => {
    render(<SiteApp />);
    clickModel();
    fireEvent.click(screen.getByText('Helmet'));
    expect(screen.queryByTestId('site-pin')).not.toBeInTheDocument();
  });
});

describe('SiteApp motion toggles', () => {
  it('flips the turntable prop on the live viewer', () => {
    render(<SiteApp />);
    const chip = screen.getByRole('button', { name: 'turntable' });

    fireEvent.click(chip);
    expect(screen.getByTestId('viewer')).toHaveAttribute('data-turntable', 'true');
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(chip);
    expect(screen.getByTestId('viewer')).toHaveAttribute('data-turntable', 'false');
  });

  it('flips the animations prop and offers the animated Fox sample', () => {
    render(<SiteApp />);
    expect(screen.getByText('Fox')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'animations' }));
    expect(screen.getByTestId('viewer')).toHaveAttribute('data-animations', 'true');
  });

  it('keeps the usage snippet in sync with the enabled toggles', () => {
    render(<SiteApp />);
    expect(screen.queryByText(/turntable/, { selector: 'pre' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'turntable' }));
    fireEvent.click(screen.getByRole('button', { name: 'animations' }));

    const snippet = screen.getByText(/SimpleViewer/, { selector: 'pre' });
    expect(snippet).toHaveTextContent('turntable');
    expect(snippet).toHaveTextContent('animations');
  });
});

describe('SiteApp still capture', () => {
  it('downloads a 1920px still through the imperative handle', async () => {
    viewerMock.__captureStill.mockResolvedValue('data:image/png;base64,x');
    const anchorClick = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    render(<SiteApp />);
    fireEvent.click(screen.getByRole('button', { name: /Download still/ }));

    await waitFor(() => expect(viewerMock.__captureStill).toHaveBeenCalledWith({ width: 1920 }));
    await waitFor(() => expect(anchorClick).toHaveBeenCalled());
    anchorClick.mockRestore();
  });

  it('reports a failed capture on the button, then recovers', async () => {
    jest.useFakeTimers();
    viewerMock.__captureStill.mockRejectedValue(new Error('nope'));

    render(<SiteApp />);
    fireEvent.click(screen.getByRole('button', { name: /Download still/ }));

    await waitFor(() => expect(screen.getByText('Capture failed')).toBeInTheDocument());
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.getByText(/Download still/)).toBeInTheDocument();
    jest.useRealTimers();
  });
});
