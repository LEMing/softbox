import type { CSSProperties } from 'react';
import { FONT, glassSurface } from '../presentation/components/theme';

export { FONT };

export const MONO_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

export const glassPanel: CSSProperties = {
  ...glassSurface,
  borderRadius: 14,
};

/** Chip button look shared by the model picker and the motion toggles. */
export const chipStyle = (active: boolean): CSSProperties => ({
  padding: '6px 14px',
  borderRadius: 999,
  // Invisible normally; forced-colors mode repaints borders, keeping the
  // active chip distinguishable there.
  border: active ? '1px solid #111318' : '1px solid transparent',
  background: active ? '#111318' : 'transparent',
  color: active ? '#fff' : '#3f3f4a',
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  textTransform: 'capitalize',
  transition: 'background 120ms ease, color 120ms ease',
});

/** Row label shared by the model picker and the motion toggles. */
export const chipRowLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#7a7a85',
  minWidth: 58,
};
