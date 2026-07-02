import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useViewerContext } from './ViewerContext';

export interface HotspotProps {
  /** World-space anchor point, e.g. a `point` from the `object:selected` event. */
  position: [number, number, number];
  /**
   * Hide the hotspot when the model occludes its anchor point (a raycast per
   * rendered frame). Off by default.
   */
  occlude?: boolean;
  /** Pin content; without children a default dot pin is rendered. */
  children?: React.ReactNode;
}

const unwrapThreeCamera = (camera: unknown): THREE.Camera | null => {
  if (camera && typeof camera === 'object') {
    const candidate = camera as { getThreeCamera?: () => THREE.Camera };
    if (typeof candidate.getThreeCamera === 'function') {
      return candidate.getThreeCamera();
    }
    if (camera instanceof THREE.Camera) {
      return camera;
    }
  }
  return null;
};

const unwrapThreeObject = (object: unknown): THREE.Object3D | null => {
  if (object && typeof object === 'object') {
    const candidate = object as { getThreeObject?: () => THREE.Object3D };
    if (typeof candidate.getThreeObject === 'function') {
      return candidate.getThreeObject();
    }
    if (object instanceof THREE.Object3D) {
      return object;
    }
  }
  return null;
};

const DefaultPin = () => (
  <span
    aria-hidden="true"
    style={{
      display: 'block',
      width: 14,
      height: 14,
      borderRadius: '50%',
      background: 'rgba(17,19,24,0.9)',
      border: '2px solid rgba(255,255,255,0.95)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
    }}
  />
);

/**
 * A DOM annotation anchored to a world-space point of the scene. Render it as
 * a child of `SimpleViewer`; the anchor is projected through the camera after
 * every rendered frame, so it tracks orbiting, zooming and resizes. Points
 * behind the camera are hidden; `occlude` also hides it when the model covers
 * the anchor.
 */
export function Hotspot({ position, occlude = false, children }: HotspotProps) {
  const { viewer } = useViewerContext();
  const elementRef = useRef<HTMLDivElement>(null);
  const [x, y, z] = position;

  useEffect(() => {
    if (!viewer) {
      return;
    }
    const element = elementRef.current;
    if (!element) {
      return;
    }

    const anchor = new THREE.Vector3();
    const projected = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();
    const toAnchor = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();

    const update = () => {
      const camera = unwrapThreeCamera(viewer.getCamera());
      const canvas = viewer.getDomElement();
      if (!camera || !canvas) {
        return;
      }
      anchor.set(x, y, z);

      // Behind-the-camera check in view space (three looks down -Z).
      camera.getWorldPosition(cameraPosition);
      projected.copy(anchor).applyMatrix4(camera.matrixWorldInverse);
      if (projected.z >= 0) {
        element.style.visibility = 'hidden';
        return;
      }

      if (occlude) {
        const model = unwrapThreeObject(viewer.getModel());
        if (model) {
          toAnchor.copy(anchor).sub(cameraPosition);
          const anchorDistance = toAnchor.length();
          raycaster.set(cameraPosition, toAnchor.normalize());
          const hit = raycaster.intersectObject(model, true)[0];
          // A small epsilon keeps a hotspot on the model's own surface visible.
          if (hit && hit.distance < anchorDistance - 1e-3) {
            element.style.visibility = 'hidden';
            return;
          }
        }
      }

      projected.copy(anchor).project(camera);
      const width = canvas.clientWidth || canvas.width;
      const height = canvas.clientHeight || canvas.height;
      element.style.visibility = 'visible';
      element.style.left = `${((projected.x + 1) / 2) * width}px`;
      element.style.top = `${((1 - projected.y) / 2) * height}px`;
    };

    update();
    const events = viewer.getEvents();
    const unsubscribe = [
      events.on('render:complete', update),
      events.on('controls:change', update),
      events.on('model:loaded', update),
    ];
    return () => {
      unsubscribe.forEach((off) => off());
    };
  }, [viewer, x, y, z, occlude]);

  return (
    <div
      ref={elementRef}
      data-testid="viewer-hotspot"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: 'translate(-50%, -50%)',
        visibility: 'hidden',
        zIndex: 10,
      }}
    >
      {children ?? <DefaultPin />}
    </div>
  );
}
