import React, { useState } from 'react';
import { ChromeTheme } from './theme';

export interface IconButtonProps {
  theme: ChromeTheme;
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  /** Show the label text next to the icon (used for the mode buttons). */
  showLabel?: boolean;
}

export function IconButton({ theme, label, active, onClick, children, showLabel }: IconButtonProps) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 34,
        padding: showLabel ? '0 12px' : '0 9px',
        border: 'none',
        borderRadius: 9,
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1,
        color: active ? theme.accent : theme.text,
        background: active ? theme.activeBg : hover ? theme.hoverBg : 'transparent',
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      {children}
      {showLabel && <span>{label}</span>}
    </button>
  );
}
