import React, { useEffect, useRef, useState } from 'react';
import SimpleViewer from '../SimpleViewerWrapper';
import { Hotspot } from '../presentation/components/Hotspot';
import type { SimpleViewerHandle } from '../types/SimpleViewerHandle';
import { Picker } from './Picker';
import { Toggles } from './Toggles';
import { CodeSnippet } from './CodeSnippet';
import { useDropModel } from './useDropModel';
import { useMediaQuery } from './useMediaQuery';
import { FONT, glassPanel } from './siteTheme';

// The Khronos sample set mixes wildly different authored scales (some in
// real-world meters, some arbitrary). WaterBottle and Avocado are already
// real-world-scale (a bottle ~0.26m, an avocado ~0.06m) so they're used
// as-is; Lantern/Helmet/Fox are re-hosted local copies with a corrective
// root-node scale baked in (see scratch-rescale-glb.mjs in git history) so
// every sample model sits at a consistent, plausible real-world size under
// the same 1-unit-= 1-meter convention as the Motorhome.
const SAMPLE_MODELS: Record<string, string> = {
  Motorhome: '/motorhome.glb',
  Lantern: '/lantern.glb',
  Helmet: '/helmet.glb',
  WaterBottle: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/WaterBottle/glTF-Binary/WaterBottle.glb',
  Avocado: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb',
  // Animated (Survey/Walk/Run clips) — the `animations` toggle's showcase.
  Fox: '/fox.glb',
};

const DROPPED_KEY = 'yours';

// A hand-tuned cinematic framing for the Motorhome model specifically — an
// elevated 3/4 hero angle, rather than the generic auto-fit's plainer view.
// Values are absolute world coordinates measured against this model's own
// bounding box, so this preset is only meaningful for it.
const MOTORHOME_CAMERA = {
  position: [-4.91, 5.26, 8.44] as const,
  target: [0.02, 1.37, -0.1] as const,
  fov: 42,
};

interface PerspectiveLike {
  fov: number;
  updateProjectionMatrix(): void;
}

const isPerspectiveCamera = (camera: unknown): camera is PerspectiveLike =>
  typeof camera === 'object' && camera !== null && 'fov' in camera && 'updateProjectionMatrix' in camera;

interface Pin {
  id: number;
  point: [number, number, number];
}

const GitHubMark = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
};

/**
 * The playground site: a full-viewport viewer as the hero, the library's own
 * preset picker as the controls, plus site chrome — brand, sample-model picker,
 * install snippet, your own .glb via drag & drop or the file browser, click-to-
 * pin hotspots (object:selected) and a captureStill download button.
 */
export function SiteApp() {
  const { dropped, isDragging, rejectedName, loadFile } = useDropModel();
  const [selected, setSelected] = useState<string>('Motorhome');
  const [turntable, setTurntable] = useState(false);
  const [animations, setAnimations] = useState(false);
  const [pins, setPins] = useState<Pin[]>([]);
  const [stillState, setStillState] = useState<'idle' | 'capturing' | 'failed'>('idle');
  const pinIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<SimpleViewerHandle>(null);
  const showSnippet = useMediaQuery('(min-width: 840px)');
  const showStillButton = useMediaQuery('(min-width: 560px)');

  // A fresh drop always takes the stage.
  useEffect(() => {
    if (dropped) {
      setSelected(DROPPED_KEY);
    }
  }, [dropped]);

  // Click the model to pin a hotspot at the hit point (the object:selected demo).
  useEffect(() => {
    const handle = viewerRef.current;
    if (!handle) {
      return;
    }
    return handle.events.on('object:selected', ({ point }) => {
      pinIdRef.current += 1;
      const id = pinIdRef.current;
      setPins((current) => [...current, { id, point: [point.x, point.y, point.z] }]);
    });
  }, []);

  // The Motorhome gets its own hero-shot camera framing once it finishes
  // loading; every other model keeps the generic auto-fit view.
  useEffect(() => {
    const handle = viewerRef.current;
    if (!handle || selected !== 'Motorhome') {
      return;
    }
    return handle.events.on('model:loaded', () => {
      // Re-read the ref rather than closing over `handle`: the engine (and
      // its camera/controls) can still be initializing when this effect first
      // registers the listener, so the outer `handle` may have a stale null
      // camera — by the time the model has actually loaded, the ref points at
      // the live one.
      const current = viewerRef.current;
      const camera = current?.camera;
      const controls = current?.controls;
      if (!camera) {
        return;
      }
      camera.position.set(...MOTORHOME_CAMERA.position);
      camera.lookAt(...MOTORHOME_CAMERA.target);
      if (isPerspectiveCamera(camera)) {
        camera.fov = MOTORHOME_CAMERA.fov;
        camera.updateProjectionMatrix();
      }
      if (controls) {
        controls.target.set(...MOTORHOME_CAMERA.target);
        controls.update();
      }
    });
  }, [selected]);

  const pickerItems = dropped ? [...Object.keys(SAMPLE_MODELS), DROPPED_KEY] : Object.keys(SAMPLE_MODELS);
  const modelUrl = selected === DROPPED_KEY && dropped ? dropped.url : SAMPLE_MODELS[selected];

  // Pins are anchored to the current model's surface — clear them with it.
  useEffect(() => {
    setPins([]);
  }, [modelUrl]);

  const handleFileChosen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      loadFile(file);
    }
    // Allow re-choosing the same file.
    event.target.value = '';
  };

  const handleDownloadStill = async () => {
    const handle = viewerRef.current;
    if (!handle || stillState === 'capturing') {
      return;
    }
    setStillState('capturing');
    try {
      const dataUrl = await handle.captureStill({ width: 1920 });
      downloadDataUrl(dataUrl, 'softbox-still.png');
      setStillState('idle');
    } catch {
      setStillState('failed');
      setTimeout(() => setStillState('idle'), 2000);
    }
  };

  const removePin = (id: number) => {
    setPins((current) => current.filter((pin) => pin.id !== id));
  };

  return (
    <div style={{ width: '100%', height: '100%', margin: 0, padding: 0, position: 'relative', fontFamily: FONT }}>
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
          maxWidth: 'calc(100vw - 32px)',
          ...glassPanel,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: '#111318' }}>
            softbox
          </span>
          <span style={{ fontSize: 12.5, color: '#6a6a75' }}>
            batteries-included React 3D viewer
          </span>
          <a
            href="https://github.com/LEMing/softbox"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
            style={{ color: '#3f3f4a', display: 'inline-flex', alignSelf: 'center', padding: 6, margin: -6 }}
          >
            <GitHubMark />
          </a>
        </div>
        <Picker label="Model" items={pickerItems} value={selected} onChange={setSelected} />
        <Toggles
          label="Motion"
          items={[
            { key: 'turntable', label: 'turntable', active: turntable, onToggle: setTurntable },
            { key: 'animations', label: 'animations', active: animations, onToggle: setAnimations },
          ]}
        />
        <div style={{ fontSize: 11.5, color: rejectedName ? '#b3261e' : '#7a7a85' }} role="status">
          {rejectedName ? (
            <>Only self-contained <code style={{ fontSize: 11 }}>.glb</code> models are supported</>
          ) : (
            <>
              Drag &amp; drop a <code style={{ fontSize: 11 }}>.glb</code> anywhere — or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  fontFamily: FONT,
                  fontSize: 11.5,
                  color: '#3f3f4a',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                browse
              </button>
              . Click the model to pin a hotspot.
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb"
          onChange={handleFileChosen}
          aria-label="Choose a .glb model file"
          style={{ display: 'none' }}
        />
      </div>

      {showSnippet && (
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
          <CodeSnippet
            usage={[
              "import { SimpleViewer } from 'softbox';",
              '',
              '<SimpleViewer',
              '  object="/model.glb"',
              ...(turntable ? ['  turntable'] : []),
              ...(animations ? ['  animations'] : []),
              '  options={{ ui: { presets: true } }}',
              '/>',
            ].join('\n')}
          />
        </div>
      )}

      {showStillButton && (
        <button
          type="button"
          onClick={handleDownloadStill}
          disabled={stillState === 'capturing'}
          style={{
            position: 'absolute',
            right: 16,
            bottom: 16,
            zIndex: 10,
            padding: '10px 16px',
            fontFamily: FONT,
            fontSize: 12.5,
            fontWeight: 600,
            color: stillState === 'failed' ? '#b3261e' : '#111318',
            cursor: stillState === 'capturing' ? 'wait' : 'pointer',
            ...glassPanel,
            borderRadius: 999,
          }}
        >
          {stillState === 'capturing' ? 'Capturing…' : stillState === 'failed' ? 'Capture failed' : 'Download still ⤓'}
        </button>
      )}

      <SimpleViewer
        ref={viewerRef}
        object={modelUrl}
        turntable={turntable}
        animations={animations}
        options={{ ui: { presets: true } }}
      >
        {pins.map((pin, index) => (
          <Hotspot key={pin.id} position={pin.point} occlude>
            <button
              type="button"
              onClick={() => removePin(pin.id)}
              aria-label={`Remove hotspot ${index + 1}`}
              title="Click to remove"
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.95)',
                background: 'rgba(17,19,24,0.92)',
                color: '#fff',
                fontFamily: FONT,
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              {index + 1}
            </button>
          </Hotspot>
        ))}
      </SimpleViewer>

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
