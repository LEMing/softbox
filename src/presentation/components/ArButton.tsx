import React, { useMemo } from 'react';
import { AROptions } from '../../types/options';
import { FONT, glassSurface } from './theme';
import {
  detectArMode,
  launchQuickLook,
  launchSceneViewer,
  sceneViewerIntentUrl,
  sceneViewerModelUrl,
} from './arHandoff';

export interface ArButtonProps {
  /** The viewer's `object` source; only network URLs can reach Scene Viewer. */
  source: unknown;
  options: AROptions;
}

/**
 * The AR handoff button: floats over the canvas and opens the model in the
 * platform's native AR viewer. Renders nothing when the device cannot hand
 * off — desktop, iOS without a `iosSrc` USDZ, Android without a fetchable
 * model URL — so consumers can set `options.ar` unconditionally.
 */
export function ArButton({ source, options }: ArButtonProps) {
  const mode = useMemo(detectArMode, []);
  const modelUrl = sceneViewerModelUrl(source);

  const launch = useMemo(() => {
    if (mode === 'quick-look' && options.iosSrc) {
      const usdzUrl = options.iosSrc;
      return () => launchQuickLook(usdzUrl);
    }
    if (mode === 'scene-viewer' && modelUrl) {
      const intentUrl = sceneViewerIntentUrl(modelUrl, options.title);
      return () => launchSceneViewer(intentUrl);
    }
    return null;
  }, [mode, options.iosSrc, options.title, modelUrl]);

  if (!launch) {
    return null;
  }

  return (
    <button
      type="button"
      data-testid="viewer-ar-button"
      aria-label="View in your space (AR)"
      onClick={launch}
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        zIndex: 10,
        padding: '8px 16px',
        borderRadius: 999,
        border: '1px solid rgba(0,0,0,0.06)',
        color: '#111318',
        fontFamily: FONT,
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1,
        cursor: 'pointer',
        ...glassSurface,
      }}
    >
      AR
    </button>
  );
}
