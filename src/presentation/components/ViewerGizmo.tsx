import React from 'react';
import * as THREE from 'three';
import { ControlsInstance } from '../../types/CommonTypes';
import { Gizmo } from 'threedgizmo';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MapControls } from 'three/examples/jsm/controls/MapControls';

type GizmoPlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface ViewerGizmoProps {
  camera: THREE.Camera | null;
  controls: ControlsInstance | null;
  render: () => void;
  placement?: GizmoPlacement;
  size?: number;
}

const GIZMO_OFFSET = 10;

const placementStyle = (placement: GizmoPlacement): React.CSSProperties => ({
  top: placement.startsWith('top') ? GIZMO_OFFSET : 'auto',
  bottom: placement.startsWith('bottom') ? GIZMO_OFFSET : 'auto',
  left: placement.endsWith('left') ? GIZMO_OFFSET : 'auto',
  right: placement.endsWith('right') ? GIZMO_OFFSET : 'auto',
});

export const ViewerGizmo: React.FC<ViewerGizmoProps> = ({
  camera,
  controls,
  render,
  placement = 'top-right',
  size = 128
}) => {
  if (!camera || !controls) {
    return null;
  }

  // Cast controls to the actual Three.js controls type
  const threeControls = controls as unknown as OrbitControls | MapControls;

  return (
    <div
      className="viewer-gizmo-container"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        // In the documented chrome stack: above hotspots (z5), level with the
        // preset picker (z10), and BELOW the loading/error overlay (z20) — a
        // scrim must cover every control.
        zIndex: 10,
        ...placementStyle(placement),
      }}
    >
      <Gizmo
        camera={camera}
        controls={threeControls}
        render={render}
      />
    </div>
  );
};