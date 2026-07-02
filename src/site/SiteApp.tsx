import React, { useEffect, useState } from 'react';
import SimpleViewer from '../SimpleViewerWrapper';
import { Picker } from './Picker';
import { CodeSnippet } from './CodeSnippet';
import { useDropModel } from './useDropModel';
import { FONT, glassPanel } from './siteTheme';

const SAMPLE_MODELS: Record<string, string> = {
  Lantern: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Lantern/glTF-Binary/Lantern.glb',
  Helmet: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
  WaterBottle: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/WaterBottle/glTF-Binary/WaterBottle.glb',
  Avocado: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb',
};

const DROPPED_KEY = 'yours';

const GitHubMark = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

/**
 * The playground site: a full-viewport viewer as the hero, the library's own
 * preset picker as the controls, plus site chrome — brand, sample-model picker,
 * install snippet and window-level .glb drag & drop.
 */
export function SiteApp() {
  const { dropped, isDragging } = useDropModel();
  const [selected, setSelected] = useState<string>('Lantern');

  // A fresh drop always takes the stage.
  useEffect(() => {
    if (dropped) {
      setSelected(DROPPED_KEY);
    }
  }, [dropped]);

  const pickerItems = dropped ? [...Object.keys(SAMPLE_MODELS), DROPPED_KEY] : Object.keys(SAMPLE_MODELS);
  const modelUrl = selected === DROPPED_KEY && dropped ? dropped.url : SAMPLE_MODELS[selected];

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, position: 'relative', fontFamily: FONT }}>
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '14px 16px',
          ...glassPanel,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: '#111318' }}>
            threedviewer
          </span>
          <span style={{ fontSize: 12.5, color: '#6a6a75' }}>
            batteries-included React 3D viewer
          </span>
          <a
            href="https://github.com/LEMing/ThreeDViewer"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
            style={{ color: '#3f3f4a', display: 'inline-flex', alignSelf: 'center' }}
          >
            <GitHubMark />
          </a>
        </div>
        <Picker label="Model" items={pickerItems} value={selected} onChange={setSelected} />
        <div style={{ fontSize: 11.5, color: '#9a9aa5' }}>
          Drag &amp; drop a <code style={{ fontSize: 11 }}>.glb</code> anywhere to view your own model
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 10 }}>
        <CodeSnippet />
      </div>

      <SimpleViewer object={modelUrl} options={{ ui: { presets: true } }} />

      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(17,19,24,0.35)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              ...glassPanel,
              padding: '18px 28px',
              fontSize: 15,
              fontWeight: 600,
              color: '#111318',
            }}
          >
            Drop your .glb to view it
          </div>
        </div>
      )}
    </div>
  );
}
