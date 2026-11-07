import React, { useEffect, useMemo, useState } from 'react';
import { AROptions } from '../../types/options';
import { SimpleViewerProps } from '../../types';
import { FONT, glassSurface } from './theme';
import {
  AR_FAILURE_HASH,
  detectArMode,
  launchQuickLook,
  launchSceneViewer,
  sceneViewerIntentUrl,
  sceneViewerModelUrl,
  type ArMode,
} from './arHandoff';

export interface ArButtonProps {
  /** The current model source; only https URLs can reach Scene Viewer. */
  source: SimpleViewerProps['object'] | undefined;
  options: AROptions;
  /** Lift a bottom-placed button clear of the built-in preset chip row. */
  clearPresetRow?: boolean;
}

const PLACEMENT_STYLE: Record<NonNullable<AROptions['placement']>, React.CSSProperties> = {
  'top-left': { top: 16, left: 16 },
  'top-right': { top: 16, right: 16 },
  'bottom-left': { bottom: 16, left: 16 },
  'bottom-right': { bottom: 16, right: 16 },
};

/**
 * The AR handoff button: floats over the canvas and opens the model in the
 * platform's native AR viewer. Renders nothing when the device cannot hand
 * off — desktop, iOS without an `iosSrc` USDZ, Android without an https
 * model URL — so consumers can set `options.ar` unconditionally. It also
 * retires itself when a Scene Viewer launch bounces off a device with no AR
 * component (the intent's failure beacon, {@link AR_FAILURE_HASH}).
 */
export function ArButton({ source, options, clearPresetRow }: ArButtonProps) {
  // Detected after mount, NOT during render: under SSR the server has no
  // way to know the device, and hydration must reproduce the server markup
  // (no button) before the capability reveal.
  const [mode, setMode] = useState<ArMode | null>(null);
  useEffect(() => {
    setMode(detectArMode());
  }, []);

  // A Scene Viewer intent that found no AR component falls back to the
  // current page with the failure hash (same-document — nothing reloads).
  // Strip the marker and stop offering a handoff that cannot work here.
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === AR_FAILURE_HASH) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
        setFailed(true);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const modelUrl = sceneViewerModelUrl(source);

  const launch = useMemo(() => {
    if (failed) {
      return null;
    }
    if (mode === 'quick-look' && options.iosSrc) {
      const usdzUrl = options.iosSrc;
      return () => launchQuickLook(usdzUrl);
    }
    if (mode === 'scene-viewer' && modelUrl) {
      return () => launchSceneViewer(sceneViewerIntentUrl(modelUrl, options.title));
    }
    return null;
  }, [failed, mode, options.iosSrc, options.title, modelUrl]);

  if (!launch) {
    return null;
  }

  const placement = options.placement ?? 'bottom-left';
  const placementStyle = { ...PLACEMENT_STYLE[placement] };
  if (clearPresetRow && placementStyle.bottom !== undefined) {
    placementStyle.bottom = 64;
  }

  return (
    <button
      type="button"
      data-testid="viewer-ar-button"
      aria-label="View in your space (AR)"
      onClick={launch}
      style={{
        position: 'absolute',
        zIndex: 10,
        padding: '8px 16px',
        borderRadius: 999,
        color: '#111318',
        fontFamily: FONT,
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1,
        cursor: 'pointer',
        ...placementStyle,
        ...glassSurface,
      }}
    >
      AR
    </button>
  );
}
