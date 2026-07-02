import React from 'react';
import { ViewerPreset } from '../../types/options';

export interface PresetPickerProps {
  active: ViewerPreset;
  onSelect: (preset: ViewerPreset) => void;
}

const PRESETS: ViewerPreset[] = ['studio', 'product', 'neutral', 'dark', 'outdoor'];

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/**
 * Built-in preset picker: a curated row of chips floating over the canvas that
 * switches the visual preset live (no rebuild, no model reload). Opt-in via
 * `ui: { presets: true }`.
 */
export function PresetPicker({ active, onSelect }: PresetPickerProps) {
  return (
    <div
      data-testid="viewer-preset-picker"
      role="group"
      aria-label="Visual preset"
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        gap: 2,
        padding: 4,
        borderRadius: 999,
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 8px 30px rgba(0,0,0,0.10)',
      }}
    >
      {PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          aria-pressed={preset === active}
          onClick={() => onSelect(preset)}
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            border: 'none',
            background: preset === active ? '#111318' : 'transparent',
            color: preset === active ? '#fff' : '#4a4a55',
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1,
            cursor: 'pointer',
            textTransform: 'capitalize',
            transition: 'background 120ms ease, color 120ms ease',
          }}
        >
          {preset}
        </button>
      ))}
    </div>
  );
}
