import React from 'react';
import { FONT } from './siteTheme';

export interface PickerProps {
  label: string;
  items: string[];
  value: string;
  onChange: (value: string) => void;
}

/** A labelled row of chip buttons (site chrome, not library UI). */
export const Picker = ({ label, items, value, onChange }: PickerProps) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#9a9aa5',
        minWidth: 58,
      }}
    >
      {label}
    </span>
    {items.map((item) => (
      <button
        key={item}
        onClick={() => onChange(item)}
        style={{
          padding: '6px 14px',
          borderRadius: 999,
          border: 'none',
          background: value === item ? '#111318' : 'transparent',
          color: value === item ? '#fff' : '#3f3f4a',
          fontFamily: FONT,
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          textTransform: 'capitalize',
          transition: 'background 120ms ease, color 120ms ease',
        }}
      >
        {item}
      </button>
    ))}
  </div>
);
