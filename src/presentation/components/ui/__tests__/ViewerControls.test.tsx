import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as THREE from 'three';
import { ViewerControls } from '../ViewerControls';
import { resolveControlsUI } from '../controlsUIConfig';

const makeControls = () => ({
  mouseButtons: { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN },
  touches: { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN },
});

const renderControls = (overrides: Partial<React.ComponentProps<typeof ViewerControls>> = {}) => {
  const controls = overrides.controls ?? makeControls();
  const props: React.ComponentProps<typeof ViewerControls> = {
    config: resolveControlsUI(true),
    controls,
    getCanvas: () => null,
    containerRef: { current: document.createElement('div') },
    modelName: 'Lantern.glb',
    backgroundColor: '#112233',
    onBackgroundColorChange: jest.fn(),
    ...overrides,
  };
  return { controls, props, ...render(<ViewerControls {...props} />) };
};

describe('ViewerControls', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders the badge, toolbar and settings button when enabled', () => {
    const { getByTestId, getByText } = renderControls();
    expect(getByTestId('viewer-model-badge')).toBeInTheDocument();
    expect(getByText('Lantern.glb')).toBeInTheDocument();
    expect(getByTestId('viewer-control-toolbar')).toBeInTheDocument();
    expect(getByTestId('viewer-model-badge')).toBeInTheDocument();
  });

  it('renders nothing when disabled', () => {
    const { container } = renderControls({ config: resolveControlsUI(false) });
    expect(container).toBeEmptyDOMElement();
  });

  it('remaps the controls when the interaction mode changes', () => {
    const controls = makeControls();
    const { getByLabelText } = renderControls({ controls });
    // Default applied on mount is orbit.
    expect(controls.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);

    fireEvent.click(getByLabelText('Pan'));
    expect(controls.mouseButtons.LEFT).toBe(THREE.MOUSE.PAN);
    expect(controls.touches.ONE).toBe(THREE.TOUCH.PAN);

    fireEvent.click(getByLabelText('Zoom'));
    expect(controls.mouseButtons.LEFT).toBe(THREE.MOUSE.DOLLY);
  });

  it('captures a screenshot from the canvas', () => {
    const canvas = { toDataURL: jest.fn(() => 'data:image/png;base64,AAA') } as unknown as HTMLCanvasElement;
    const anchor = { href: '', download: '', click: jest.fn() } as unknown as HTMLAnchorElement;

    const { getByLabelText } = renderControls({ getCanvas: () => canvas });

    // Intercept only the anchor the screenshot creates; let React create the rest.
    const realCreate = document.createElement.bind(document);
    jest
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => (tag === 'a' ? anchor : realCreate(tag)));

    fireEvent.click(getByLabelText('Screenshot'));

    expect(canvas.toDataURL).toHaveBeenCalled();
    expect(anchor.click).toHaveBeenCalled();
  });

  it('opens the settings panel and reports background color changes', () => {
    const onBackgroundColorChange = jest.fn();
    const { getByLabelText, getByTestId, queryByTestId } = renderControls({ onBackgroundColorChange });

    expect(queryByTestId('viewer-settings-panel')).toBeNull();
    fireEvent.click(getByLabelText('Settings'));
    expect(getByTestId('viewer-settings-panel')).toBeInTheDocument();

    fireEvent.change(getByLabelText('Background color'), { target: { value: '#ff0000' } });
    expect(onBackgroundColorChange).toHaveBeenCalledWith('#ff0000');
  });

  it('omits pieces that are turned off', () => {
    const { queryByTestId, queryByLabelText } = renderControls({
      config: resolveControlsUI({ modelBadge: false, settings: false }),
    });
    expect(queryByTestId('viewer-model-badge')).toBeNull();
    expect(queryByLabelText('Settings')).toBeNull();
    expect(queryByTestId('viewer-control-toolbar')).toBeInTheDocument();
  });
});
