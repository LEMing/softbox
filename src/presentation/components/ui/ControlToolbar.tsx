import React from 'react';
import { InteractionMode } from '../../../types/options';
import { ChromeTheme, surfaceStyle } from './theme';
import { IconButton } from './IconButton';
import {
  OrbitIcon,
  PanIcon,
  ZoomIcon,
  CameraIcon,
  FullscreenIcon,
  FullscreenExitIcon,
} from './icons';

export interface ControlToolbarProps {
  theme: ChromeTheme;
  showInteractionModes: boolean;
  showScreenshot: boolean;
  showFullscreen: boolean;
  mode: InteractionMode;
  onModeChange: (mode: InteractionMode) => void;
  onScreenshot: () => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
}

const MODES: Array<{ mode: InteractionMode; label: string; Icon: React.FC<{ size?: number }> }> = [
  { mode: 'orbit', label: 'Orbit', Icon: OrbitIcon },
  { mode: 'pan', label: 'Pan', Icon: PanIcon },
  { mode: 'zoom', label: 'Zoom', Icon: ZoomIcon },
];

/** Bottom-center floating toolbar. */
export function ControlToolbar({
  theme,
  showInteractionModes,
  showScreenshot,
  showFullscreen,
  mode,
  onModeChange,
  onScreenshot,
  onFullscreen,
  isFullscreen,
}: ControlToolbarProps) {
  const divider = (
    <span
      aria-hidden="true"
      style={{ width: 1, height: 20, margin: '0 4px', background: theme.surfaceBorder }}
    />
  );

  return (
    <div
      data-testid="viewer-control-toolbar"
      role="toolbar"
      aria-label="Viewer controls"
      style={{
        ...surfaceStyle(theme),
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 5,
        borderRadius: 14,
      }}
    >
      {showInteractionModes &&
        MODES.map(({ mode: m, label, Icon }) => (
          <IconButton
            key={m}
            theme={theme}
            label={label}
            showLabel
            active={mode === m}
            onClick={() => onModeChange(m)}
          >
            <Icon size={17} />
          </IconButton>
        ))}

      {showInteractionModes && (showScreenshot || showFullscreen) && divider}

      {showScreenshot && (
        <IconButton theme={theme} label="Screenshot" onClick={onScreenshot}>
          <CameraIcon size={18} />
        </IconButton>
      )}
      {showFullscreen && (
        <IconButton
          theme={theme}
          label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          onClick={onFullscreen}
        >
          {isFullscreen ? <FullscreenExitIcon size={18} /> : <FullscreenIcon size={18} />}
        </IconButton>
      )}
    </div>
  );
}
