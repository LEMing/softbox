import type { CSSProperties } from 'react';

export const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const MONO_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

export const glassPanel: CSSProperties = {
  borderRadius: 14,
  background: 'rgba(255,255,255,0.78)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 8px 30px rgba(0,0,0,0.10)',
};
