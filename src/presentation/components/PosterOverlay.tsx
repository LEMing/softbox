import React, { useEffect, useState } from 'react';

export interface PosterOverlayProps {
  src: string;
  /** False once the loaded model has actually painted — starts the fade. */
  visible: boolean;
}

const FADE_MS = 400;

/**
 * The poster image shown over the canvas until the model's first painted
 * frame. This is what makes a slow GLB (or a `loading: 'lazy'` viewer that
 * has not even booted WebGL yet) look instant: the poster IS the first
 * paint, and the live model dissolves in underneath it when ready.
 * Self-removing after the fade.
 */
export function PosterOverlay({ src, visible }: PosterOverlayProps) {
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    if (visible) {
      return;
    }
    // transitionend is the prompt unmount, but it is not guaranteed: an
    // overlay MOUNTED already-hidden runs no transition at all, and a fade
    // interrupted by display:none fires transitioncancel instead. The timer
    // makes sure no invisible full-bleed <img> ever lingers in the DOM.
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
        // Above hotspots (z5) and the preset picker (z10), below the
        // loading/error overlay (z20) so progress and errors stay readable.
        zIndex: 15,
        // While opaque it must also CATCH input: the chrome underneath (AR
        // button, preset chips, hotspots) is invisible, and a tap must not
        // trigger controls the user cannot see. Released during the fade so
        // the revealed scene is interactive immediately.
        pointerEvents: visible ? 'auto' : 'none',
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease`,
      }}
    />
  );
}
