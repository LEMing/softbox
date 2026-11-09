import React, { useEffect, useState } from 'react';

export interface PosterOverlayProps {
  src: string;
  visible: boolean;
}

const FADE_MS = 400;

export function PosterOverlay({ src, visible }: PosterOverlayProps) {
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    if (visible) {
      return;
    }
    const fallback = setTimeout(() => setFaded(true), FADE_MS + 100);
    return () => clearTimeout(fallback);
  }, [visible]);
  if (faded) {
    return null;
  }

  return (
    <img
      data-testid="viewer-poster"
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      onTransitionEnd={() => {
        if (!visible) {
          setFaded(true);
        }
      }}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        zIndex: 15,
        pointerEvents: visible ? 'auto' : 'none',
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease`,
      }}
    />
  );
}
