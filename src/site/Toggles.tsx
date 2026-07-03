import React from 'react';
import { chipRowLabel, chipStyle } from './siteTheme';

export interface ToggleItem {
  key: string;
  label: string;
  active: boolean;
  onToggle: (active: boolean) => void;
}

export interface TogglesProps {
  label: string;
  items: ToggleItem[];
}

/** A labelled row of independent on/off chips (site chrome, not library UI). */
export const Toggles = ({ label, items }: TogglesProps) => (
  <div role="group" aria-label={label} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
    <span style={chipRowLabel}>{label}</span>
    {items.map((item) => (
      <button
        key={item.key}
        type="button"
        aria-pressed={item.active}
        onClick={() => item.onToggle(!item.active)}
        style={chipStyle(item.active)}
      >
        {item.label}
      </button>
    ))}
  </div>
);
