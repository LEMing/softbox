import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ViewerGizmo } from '../ViewerGizmo';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Mock threedgizmo module
jest.mock('threedgizmo', () => ({
  Gizmo: ({ camera, controls, render }: any) => (
    <div data-testid="gizmo-component">
      Gizmo Mock - Camera: {camera ? 'Present' : 'Missing'}, 
      Controls: {controls ? 'Present' : 'Missing'}
    </div>
  )
}));

describe('ViewerGizmo', () => {
  let mockCamera: THREE.PerspectiveCamera;
  let mockControls: OrbitControls;
  let mockRender: jest.Mock;

  beforeEach(() => {
    // Create mock camera
    mockCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    
    // Create mock controls
    const mockCanvas = document.createElement('canvas');
    mockControls = new OrbitControls(mockCamera, mockCanvas);
    
    // Create mock render function
    mockRender = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render gizmo when camera and controls are provided', () => {
    render(
      <ViewerGizmo
        camera={mockCamera}
        controls={mockControls as any}
        render={mockRender}
      />
    );

    expect(screen.getByTestId('gizmo-component')).toBeInTheDocument();
    expect(screen.getByText(/Camera: Present/)).toBeInTheDocument();
    expect(screen.getByText(/Controls: Present/)).toBeInTheDocument();
  });

  it('should not render gizmo when camera is null', () => {
    const { container } = render(
      <ViewerGizmo
        camera={null}
        controls={mockControls as any}
        render={mockRender}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should not render gizmo when controls is null', () => {
    const { container } = render(
      <ViewerGizmo
        camera={mockCamera}
        controls={null}
        render={mockRender}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should apply correct positioning for different placements', () => {
    const { container, rerender } = render(
      <ViewerGizmo
        camera={mockCamera}
        controls={mockControls as any}
        render={mockRender}
        placement="top-right"
        size={128}
      />
    );

    const gizmoContainer = container.querySelector('.viewer-gizmo-container') as HTMLElement;
    expect(gizmoContainer).toHaveStyle({
      position: 'absolute',
      width: '128px',
      height: '128px',
      top: '10px',
      right: '10px'
    });

    // Test other placements
    rerender(
      <ViewerGizmo
        camera={mockCamera}
        controls={mockControls as any}
        render={mockRender}
        placement="bottom-left"
        size={160}
      />
    );

    expect(gizmoContainer).toHaveStyle({
      position: 'absolute',
      width: '160px',
      height: '160px',
      bottom: '10px',
      left: '10px'
    });
  });

  it('should use default values when placement and size are not provided', () => {
    const { container } = render(
      <ViewerGizmo
        camera={mockCamera}
        controls={mockControls as any}
        render={mockRender}
      />
    );

    const gizmoContainer = container.querySelector('.viewer-gizmo-container') as HTMLElement;
    expect(gizmoContainer).toHaveStyle({
      position: 'absolute',
      width: '128px',
      height: '128px',
      top: '10px',
      right: '10px'
    });
  });
});