import React from 'react';

export interface LoadingOverlayProps {
  status: 'loading' | 'error';
  label: string;
  color: string;
  backdrop: string;
}

/**
 * Self-contained loading/error overlay for the viewer. Uses an inline SVG with
 * SMIL animation so it needs no external CSS. Non-interactive (pointer-events:
 * none) — it sits over the canvas and dismisses itself when loading resolves.
 */
export function LoadingOverlay({ status, label, color, backdrop }: LoadingOverlayProps) {
  // Respect the user's reduced-motion preference: show a static spinner arc
  // rather than the rotating SMIL animation.
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      data-testid="viewer-loading-overlay"
      role="status"
      aria-live="polite"
      aria-busy={status === 'loading'}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        background: backdrop,
        color,
        pointerEvents: 'none',
        userSelect: 'none',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        fontSize: 14,
      }}
    >
      {status === 'loading' ? (
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r="18" fill="none" stroke={color} strokeOpacity="0.25" strokeWidth="4" />
          <path d="M22 4 a18 18 0 0 1 18 18" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round">
            {!reduceMotion && (
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 22 22"
                to="360 22 22"
                dur="0.9s"
                repeatCount="indefinite"
              />
            )}
          </path>
        </svg>
      ) : (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )}
      {label && <div style={{ opacity: 0.92, maxWidth: '80%', textAlign: 'center' }}>{label}</div>}
    </div>
  );
}
