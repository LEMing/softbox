import React, { useState } from 'react';

export interface PosterOverlayProps {
  src: string;
  /** False once the loaded model has actually painted — starts the fade. */
  visible: boolean;
}

/**
 * The poster image shown over the canvas until the model's first painted
 * frame. This is what makes a slow GLB (or a `loading: 'lazy'` viewer that
 * has not even booted WebGL yet) look instant: the poster IS the first
 * paint, and the live model dissolves in underneath it when ready.
 * Non-interactive and self-removing after the fade.
 */
export function PosterOverlay({ src, visible }: PosterOverlayProps) {
  const [faded, setFaded] = useState(false);
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
        // Above hotspots (z5) and the preset picker (z10), below the
        // loading/error overlay (z20) so progress and errors stay readable.
        zIndex: 15,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 400ms ease',
      }}
    />
  );
}
