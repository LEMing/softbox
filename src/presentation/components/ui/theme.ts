import type { CSSProperties } from 'react';

export interface ChromeTheme {
  surface: string;
  surfaceBorder: string;
  text: string;
  textMuted: string;
  accent: string;
  activeBg: string;
  hoverBg: string;
  shadow: string;
}

const DARK: ChromeTheme = {
  surface: 'rgba(28,30,36,0.72)',
  surfaceBorder: 'rgba(255,255,255,0.10)',
  text: '#f2f3f5',
  textMuted: 'rgba(242,243,245,0.65)',
  accent: '#4c8dff',
  activeBg: 'rgba(76,141,255,0.18)',
  hoverBg: 'rgba(255,255,255,0.08)',
  shadow: '0 6px 24px rgba(0,0,0,0.35)',
};

const LIGHT: ChromeTheme = {
  surface: 'rgba(255,255,255,0.82)',
  surfaceBorder: 'rgba(15,16,20,0.10)',
  text: '#1a1c22',
  textMuted: 'rgba(26,28,34,0.6)',
  accent: '#2f6df6',
  activeBg: 'rgba(47,109,246,0.14)',
  hoverBg: 'rgba(15,16,20,0.06)',
  shadow: '0 6px 24px rgba(0,0,0,0.18)',
};

export const getTheme = (theme: 'dark' | 'light'): ChromeTheme =>
  theme === 'light' ? LIGHT : DARK;

/** Shared style for a floating, blurred chrome surface. */
export const surfaceStyle = (t: ChromeTheme): CSSProperties => ({
  background: t.surface,
  border: `1px solid ${t.surfaceBorder}`,
  boxShadow: t.shadow,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  color: t.text,
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
});
