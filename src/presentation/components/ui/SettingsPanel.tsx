import React, { useState } from 'react';
import { ChromeTheme, surfaceStyle } from './theme';
import { IconButton } from './IconButton';
import { SettingsIcon, CloseIcon } from './icons';

/** Live-tunable viewer settings surfaced in the panel. */
export interface ViewerSettings {
  backgroundColor: string;
  gizmo: boolean;
  shadows: boolean;
  exposure: number;
  environmentIntensity: number;
}

export interface SettingsPanelProps {
  theme: ChromeTheme;
  settings: ViewerSettings;
  onChange: <K extends keyof ViewerSettings>(key: K, value: ViewerSettings[K]) => void;
  /** Which rows to show — pieces the caller wants exposed. */
  show?: Partial<Record<keyof ViewerSettings, boolean>>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13, minHeight: 26 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Toggle({ theme, checked, label, onChange }: { theme: ChromeTheme; checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 22,
        borderRadius: 11,
        border: 'none',
        cursor: 'pointer',
        padding: 2,
        background: checked ? theme.accent : theme.hoverBg,
        transition: 'background 120ms ease',
      }}
    >
      <span
        style={{
          display: 'block',
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 120ms ease',
        }}
      />
    </button>
  );
}

/** Top-right settings button + panel bound to the live viewer settings. */
export function SettingsPanel({ theme, settings, onChange, show }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const visible = (key: keyof ViewerSettings) => show?.[key] ?? true;

  return (
    <div style={{ position: 'absolute', top: 12, right: 12 }}>
      <div style={{ ...surfaceStyle(theme), display: 'inline-flex', borderRadius: 17, padding: 3 }}>
        <IconButton theme={theme} label="Settings" active={open} onClick={() => setOpen((v) => !v)}>
          <SettingsIcon size={18} />
        </IconButton>
      </div>

      {open && (
        <div
          data-testid="viewer-settings-panel"
          role="dialog"
          aria-label="Viewer settings"
          style={{ ...surfaceStyle(theme), position: 'absolute', top: 44, right: 0, width: 240, padding: 14, borderRadius: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Settings</span>
            <button
              type="button"
              aria-label="Close settings"
              onClick={() => setOpen(false)}
              style={{ display: 'inline-flex', border: 'none', background: 'transparent', color: theme.textMuted, cursor: 'pointer', padding: 2 }}
            >
              <CloseIcon size={15} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible('backgroundColor') && (
              <Row label="Background">
                <input
                  type="color"
                  aria-label="Background color"
                  value={settings.backgroundColor}
                  onChange={(e) => onChange('backgroundColor', e.target.value)}
                  style={{ width: 34, height: 24, padding: 0, border: `1px solid ${theme.surfaceBorder}`, borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
                />
              </Row>
            )}
            {visible('gizmo') && (
              <Row label="Gizmo">
                <Toggle theme={theme} label="Gizmo" checked={settings.gizmo} onChange={(v) => onChange('gizmo', v)} />
              </Row>
            )}
            {visible('shadows') && (
              <Row label="Shadows">
                <Toggle theme={theme} label="Shadows" checked={settings.shadows} onChange={(v) => onChange('shadows', v)} />
              </Row>
            )}
            {visible('exposure') && (
              <Row label="Exposure">
                <input
                  type="range"
                  aria-label="Exposure"
                  min={0}
                  max={3}
                  step={0.05}
                  value={settings.exposure}
                  onChange={(e) => onChange('exposure', Number(e.target.value))}
                  style={{ width: 110, accentColor: theme.accent }}
                />
              </Row>
            )}
            {visible('environmentIntensity') && (
              <Row label="Env intensity">
                <input
                  type="range"
                  aria-label="Environment intensity"
                  min={0}
                  max={3}
                  step={0.05}
                  value={settings.environmentIntensity}
                  onChange={(e) => onChange('environmentIntensity', Number(e.target.value))}
                  style={{ width: 110, accentColor: theme.accent }}
                />
              </Row>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
