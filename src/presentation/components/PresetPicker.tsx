import React from 'react';
import { ViewerPreset } from '../../types/options';
import { VIEWER_PRESETS } from '../../presets';
import { FONT, glassSurface } from './theme';

export interface PresetPickerProps {
  active: ViewerPreset;
  onSelect: (preset: ViewerPreset) => void;
}

const PRESETS = Object.keys(VIEWER_PRESETS) as ViewerPreset[];

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
        maxWidth: 'calc(100% - 16px)',
        overflowX: 'auto',
        ...glassSurface,
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
            border: preset === active ? '1px solid #111318' : '1px solid transparent',
            background: preset === active ? '#111318' : 'transparent',
            color: preset === active ? '#fff' : '#3f3f4a',
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1,
            whiteSpace: 'nowrap',
            flexShrink: 0,
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
