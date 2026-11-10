import React, { useEffect, useRef } from 'react';
import { useViewerContext } from './ViewerContext';

export interface HotspotProps {
  position: [number, number, number];
  occlude?: boolean;
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

    const anchor = { x, y, z };
    const update = () => {
      const projection = projector.project(anchor, occlude);
      if (!projection) {
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
    window.addEventListener('resize', invalidateAndUpdate);
    return () => {
      unsubscribe.forEach((off) => off());
      window.removeEventListener('resize', invalidateAndUpdate);
    };
  }, [viewer, x, y, z, occlude]);

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
        zIndex: 5,
        pointerEvents: hasChildren ? 'auto' : 'none',
      }}
    >
      {hasChildren ? children : <DefaultPin />}
    </div>
  );
}
