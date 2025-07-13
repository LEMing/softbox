import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ControlsInstance } from '../../types/CommonTypes';
import { Gizmo } from 'threedgizmo';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MapControls } from 'three/examples/jsm/controls/MapControls';

interface ViewerGizmoProps {
  camera: THREE.Camera | null;
  controls: ControlsInstance | null;
  render: () => void;
  placement?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size?: number;
}

export const ViewerGizmo: React.FC<ViewerGizmoProps> = ({ 
  camera, 
  controls, 
  render,
  placement = 'top-right',
  size = 128
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Apply positioning styles based on placement
    const container = containerRef.current;
    container.style.position = 'absolute';
    container.style.width = `${size}px`;
    container.style.height = `${size}px`;
    container.style.zIndex = '1000';
    
    // Reset all positions
    container.style.top = 'auto';
    container.style.bottom = 'auto';
    container.style.left = 'auto';
    container.style.right = 'auto';
    
    // Apply placement-specific positioning
    const offset = '10px';
    switch (placement) {
      case 'top-left':
        container.style.top = offset;
        container.style.left = offset;
        break;
      case 'top-right':
        container.style.top = offset;
        container.style.right = offset;
        break;
      case 'bottom-left':
        container.style.bottom = offset;
        container.style.left = offset;
        break;
      case 'bottom-right':
        container.style.bottom = offset;
        container.style.right = offset;
        break;
    }
  }, [placement, size]);

  if (!camera || !controls) {
    return null;
  }

  // Cast controls to the actual Three.js controls type
  const threeControls = controls as unknown as OrbitControls | MapControls;

  return (
    <div ref={containerRef} className="viewer-gizmo-container">
      <Gizmo
        camera={camera}
        controls={threeControls}
        render={render}
      />
    </div>
  );
};