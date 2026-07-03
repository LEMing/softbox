import type { CSSProperties } from 'react';

/** Shared chrome tokens for the built-in UI and the playground site. */
export const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Frosted-glass surface (no radius — pills and panels round differently). */
export const glassSurface: CSSProperties = {
  background: 'rgba(255,255,255,0.78)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 8px 30px rgba(0,0,0,0.10)',
};
