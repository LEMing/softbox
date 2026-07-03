import React, { useEffect, useRef } from 'react';
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
 * the anchor. The projection math lives behind the viewer's anchor-projection
 * port — this component only wires events to DOM styles.
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
    const projector = viewer.createAnchorProjector();
    if (!projector) {
      return;
    }

    const anchor = { x, y, z };
    const update = () => {
      const projection = projector.project(anchor, occlude);
      if (!projection) {
        // Nothing affecting the projection changed — keep the placement.
        return;
      }
      if (!projection.visible) {
        element.style.visibility = 'hidden';
        return;
      }
      element.style.visibility = 'visible';
      element.style.left = `${projection.left}px`;
      element.style.top = `${projection.top}px`;
    };

    // model:loaded may change occlusion without moving the camera; force a
    // full recompute.
    const invalidateAndUpdate = () => {
      projector.invalidate();
      update();
    };

    update();
    const events = viewer.getEvents();
    const unsubscribe = [
      events.on('render:complete', update),
      events.on('controls:change', update),
      events.on('model:loaded', invalidateAndUpdate),
    ];
    // ViewerCore.resize() renders directly (no render:complete), so track
    // window resizes too; the size guard makes redundant calls free.
    window.addEventListener('resize', invalidateAndUpdate);
    return () => {
      unsubscribe.forEach((off) => off());
      window.removeEventListener('resize', invalidateAndUpdate);
    };
  }, [viewer, x, y, z, occlude]);

  // false/null (e.g. `{showLabel && <Card />}`) falls back to the default pin.
  const hasChildren = children !== undefined && children !== null && children !== false;

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
        // Below the built-in chrome (preset picker z10, loading overlay z20).
        zIndex: 5,
        // The passive default pin must not block orbiting or click-picking;
        // interactive custom children keep receiving pointer events.
        pointerEvents: hasChildren ? 'auto' : 'none',
      }}
    >
      {hasChildren ? children : <DefaultPin />}
    </div>
  );
}
