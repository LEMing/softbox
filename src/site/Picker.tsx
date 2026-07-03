import React from 'react';
import { chipRowLabel, chipStyle } from './siteTheme';

export interface PickerProps {
  label: string;
  items: string[];
  value: string;
  onChange: (value: string) => void;
}

/** A labelled row of single-choice chip buttons (site chrome, not library UI). */
export const Picker = ({ label, items, value, onChange }: PickerProps) => (
  <div role="group" aria-label={label} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
    <span style={chipRowLabel}>{label}</span>
    {items.map((item) => (
      <button
        key={item}
        type="button"
        aria-pressed={value === item}
        onClick={() => onChange(item)}
        style={chipStyle(value === item)}
      >
        {item}
      </button>
    ))}
  </div>
);
