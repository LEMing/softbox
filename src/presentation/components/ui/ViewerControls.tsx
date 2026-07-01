import React, { useEffect, useState } from 'react';
import { InteractionMode } from '../../../types/options';
import { ResolvedControlsUI } from './controlsUIConfig';
import { getTheme } from './theme';
import { applyInteractionMode } from './interactionMode';
import { downloadCanvasScreenshot, toggleFullscreen, isFullscreen as readFullscreen } from './viewerActions';
import { ModelBadge } from './ModelBadge';
import { ControlToolbar } from './ControlToolbar';
import { SettingsPanel } from './SettingsPanel';

export interface ViewerControlsProps {
  config: ResolvedControlsUI;
  /** Unwrapped OrbitControls/MapControls instance (for interaction modes). */
  controls: unknown;
  getCanvas: () => HTMLCanvasElement | null;
  containerRef: React.RefObject<HTMLElement | null>;
  modelName?: string;
  backgroundColor: string;
  onBackgroundColorChange: (color: string) => void;
}

/**
 * Built-in control overlay: model badge, floating toolbar (interaction modes /
 * screenshot / fullscreen) and a settings panel. Rendered over the canvas by
 * SimpleViewer when `options.ui` is enabled.
 */
export function ViewerControls({
  config,
  controls,
  getCanvas,
  containerRef,
  modelName,
  backgroundColor,
  onBackgroundColorChange,
}: ViewerControlsProps) {
  const theme = getTheme(config.theme);
  const [mode, setMode] = useState<InteractionMode>('orbit');
  const [fullscreen, setFullscreen] = useState(false);

  // Apply the interaction mode whenever it (or the controls instance) changes.
  useEffect(() => {
    if (config.interactionModes) {
      applyInteractionMode(controls, mode);
    }
  }, [controls, mode, config.interactionModes]);

  // Keep the fullscreen button in sync with native fullscreen changes (Esc, etc).
  useEffect(() => {
    const onChange = () => setFullscreen(readFullscreen());
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  if (!config.enabled) {
    return null;
  }

  const showToolbar =
    config.toolbar && (config.interactionModes || config.screenshot || config.fullscreen);

  return (
    <>
      {config.modelBadge && modelName && <ModelBadge theme={theme} name={modelName} />}

      {config.settings && (
        <SettingsPanel
          theme={theme}
          backgroundColor={backgroundColor}
          onBackgroundColorChange={onBackgroundColorChange}
        />
      )}

      {showToolbar && (
        <ControlToolbar
          theme={theme}
          showInteractionModes={config.interactionModes}
          showScreenshot={config.screenshot}
          showFullscreen={config.fullscreen}
          mode={mode}
          onModeChange={setMode}
          onScreenshot={() => downloadCanvasScreenshot(getCanvas())}
          onFullscreen={() => toggleFullscreen(containerRef.current)}
          isFullscreen={fullscreen}
        />
      )}
    </>
  );
}
