import React, { useState } from 'react';
import { ChromeTheme, surfaceStyle } from './theme';
import { IconButton } from './IconButton';
import { SettingsIcon, CloseIcon } from './icons';

export interface SettingsPanelProps {
  theme: ChromeTheme;
  backgroundColor: string;
  onBackgroundColorChange: (color: string) => void;
}

/**
 * Top-right settings button that toggles a small panel. Starts with a live
 * background-color control; designed to grow more settings over time.
 */
export function SettingsPanel({ theme, backgroundColor, onBackgroundColorChange }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'absolute', top: 12, right: 12 }}>
      <div
        style={{
          ...surfaceStyle(theme),
          display: 'inline-flex',
          borderRadius: 17,
          padding: 3,
        }}
      >
        <IconButton
          theme={theme}
          label="Settings"
          active={open}
          onClick={() => setOpen((v) => !v)}
        >
          <SettingsIcon size={18} />
        </IconButton>
      </div>

      {open && (
        <div
          data-testid="viewer-settings-panel"
          role="dialog"
          aria-label="Viewer settings"
          style={{
            ...surfaceStyle(theme),
            position: 'absolute',
            top: 44,
            right: 0,
            width: 220,
            padding: 14,
            borderRadius: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>Settings</span>
            <button
              type="button"
              aria-label="Close settings"
              onClick={() => setOpen(false)}
              style={{
                display: 'inline-flex',
                border: 'none',
                background: 'transparent',
                color: theme.textMuted,
                cursor: 'pointer',
                padding: 2,
              }}
            >
              <CloseIcon size={15} />
            </button>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 13,
              color: theme.text,
            }}
          >
            Background
            <input
              type="color"
              aria-label="Background color"
              value={backgroundColor}
              onChange={(e) => onBackgroundColorChange(e.target.value)}
              style={{
                width: 34,
                height: 24,
                padding: 0,
                border: `1px solid ${theme.surfaceBorder}`,
                borderRadius: 6,
                background: 'transparent',
                cursor: 'pointer',
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
