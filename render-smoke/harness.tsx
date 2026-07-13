import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import {
  SimpleViewer,
  Hotspot,
  type SimpleViewerHandle,
  type ViewerPreset,
  type ViewerScene,
} from '../src';

/**
 * The render-smoke harness: a self-contained page (no network fetches) that
 * mounts the real viewer on a procedural model so Playwright can observe
 * actual WebGL pixels in CI. Scenarios are selected via query params:
 *   ?preset=studio|product|neutral|dark|outdoor   (default: none = defaults)
 *   ?scene=studio_dome|studio_soft|outdoor_concrete (default: none = studio_dome)
 *   ?env=<url>                                    (explicit environment.url — lets outdoor
 *                                                  scenes run offline via a local sky image)
 *   ?topdown=1                                    (straight-down camera — the ground-repetition
 *                                                  worst case)
 *   ?model=pillar                                 (tall-thin 20cm pillar instead of the knot)
 *   ?hotspot=1                                    (anchor a hotspot at the origin)
 *   ?turntable=1                                  (auto-rotate the camera)
 *   ?animate=1                                    (play a clip on the model)
 *   ?effects=1                                    (opt-in bloom + vignette + grain)
 *   ?pathtracing=1                                (starvation-budget path tracing probe)
 */
declare global {
  interface Window {
    __renderedFrames: number;
    __modelLoaded: boolean;
    __pageErrors: string[];
    __captureStill: () => Promise<string>;
    __captureVideo: (duration: number) => Promise<{ size: number; type: string }>;
    __ptSamples: number;
    __setScene: (scene: ViewerScene) => void;
  }
}

window.__renderedFrames = 0;
window.__modelLoaded = false;
window.__ptSamples = 0;
// Surfaced to the tests so a broken page fails fast with the reason instead
// of timing out silently waiting for a frame that will never come.
window.__pageErrors = [];
window.addEventListener('error', (event) => {
  window.__pageErrors.push(`error: ${event.message}`);
});
window.addEventListener('unhandledrejection', (event) => {
  window.__pageErrors.push(`unhandledrejection: ${String(event.reason)}`);
});
const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  window.__pageErrors.push(`console.error: ${args.map(String).join(' ')}`);
  originalConsoleError(...args);
};

const params = new URLSearchParams(window.location.search);
const preset = (params.get('preset') as ViewerPreset | null) ?? undefined;
const initialScene = (params.get('scene') as ViewerScene | null) ?? undefined;
const envUrl = params.get('env') ?? undefined;
// Straight-down camera: the view where ground-texture repetition is most
// visible (hundreds of repeats on screen at once).
const topdown = params.get('topdown') === '1';
const modelKind = params.get('model');
const withHotspot = params.get('hotspot') === '1';
const turntable = params.get('turntable') === '1' || undefined;
const animate = params.get('animate') === '1' || undefined;
const withEffects = params.get('effects') === '1';
const withPathTracing = params.get('pathtracing') === '1';

const makeModel = () => {
  if (modelKind === 'pillar') {
    // A tall, thin, SMALL (20cm) model — the avocado/bottle class whose
    // contact shadow historically broke (a fixed ~2cm shadow-bias offset
    // erased its whole contact pool). Low-poly for the software rasterizer.
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: '#c2410c', roughness: 0.5, metalness: 0.1 })
    );
    pillar.name = 'smoke-pillar';
    return pillar;
  }
  // Coarse tessellation on purpose: every triangle costs real time on the
  // software rasterizer CI renders with.
  const mesh = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1, 0.35, 64, 12),
    new THREE.MeshStandardMaterial({ color: '#c2410c', roughness: 0.35, metalness: 0.15 })
  );
  mesh.name = 'smoke-torus-knot';
  if (animate) {
    // A full turn in 4s — plenty of pixel change between spaced screenshots.
    mesh.animations = [
      new THREE.AnimationClip('Turn', 4, [
        new THREE.NumberKeyframeTrack('smoke-torus-knot.rotation[y]', [0, 4], [0, Math.PI * 2]),
      ]),
    ];
  }
  return mesh;
};

const Harness = () => {
  const viewerRef = useRef<SimpleViewerHandle>(null);
  const model = useRef(makeModel());
  // Stateful so tests can switch the scene on a LIVE viewer — pins the
  // fast-rebuild bail-out (see useViewerCore's viewer-state comment).
  const [scene, setScene] = useState(initialScene);

  useEffect(() => {
    window.__setScene = setScene;
    const handle = viewerRef.current;
    if (!handle) {
      return;
    }
    // Read the ref at call time: the handle is recreated once the core viewer
    // initializes, and only the late one has a live captureStill.
    window.__captureStill = async () => viewerRef.current!.captureStill();
    // Blobs don't cross page.evaluate — hand the test size + type instead.
    window.__captureVideo = async (duration: number) => {
      const blob = await viewerRef.current!.captureVideo({ duration });
      return { size: blob.size, type: blob.type };
    };
    // render:complete carries the live path-tracing sample counter — the
    // probe watches it grow, so a tracer stuck at 0 fails fast instead of
    // hiding behind a completion event that never fires.
    const offRender = handle.events.on('render:complete', ({ samples }) => {
      window.__renderedFrames += 1;
      window.__ptSamples = samples ?? 0;
    });
    const offLoaded = handle.events.on('model:loaded', () => {
      window.__modelLoaded = true;
    });
    return () => {
      offRender();
      offLoaded();
    };
  }, []);

  const scenarioOptions = withEffects
    ? { renderer: { bloom: true, vignette: true, filmGrain: true, colorGrade: true } }
    : withPathTracing
      ? {
          // Starvation budget for SwiftShader: convergence is not the
          // point — a WORKING tracer shows the orange knot within a few
          // noisy samples, a broken ingest (the 0.0.24 class) shows
          // black regardless of budget.
          pathTracing: {
            enabled: true,
            maxSamples: 12,
            bounces: 1,
            renderScale: 0.25,
            dynamicLowRes: false,
          },
        }
      : undefined;
  // Explicit options win over the scene's fragment, so a local `?env=` image
  // replaces an outdoor scene's CDN HDRI — and the empty-string texture
  // overrides knock out the CDN photo maps (deepMerge skips undefined, so ''
  // is the explicit "off" that routes the disc to its procedural fallback).
  // CI stays fully offline.
  const withScene = scene ? { ...scenarioOptions, scene } : scenarioOptions;
  const withEnv = envUrl
    ? {
        ...withScene,
        environment: { url: envUrl },
        helpers: {
          grid: { styleOptions: { texture: '', normalMap: '', roughnessMap: '' } },
        },
      }
    : withScene;
  const options = topdown
    ? {
        ...withEnv,
        camera: {
          position: [0, 24, 0.01] as [number, number, number],
          target: [0, 0, 0] as [number, number, number],
          autoFitToObject: false,
        },
      }
    : withEnv;

  return (
    <SimpleViewer
      ref={viewerRef}
      object={model.current}
      preset={preset}
      turntable={turntable}
      animations={animate}
      options={options}
    >
      {withHotspot && <Hotspot position={[0, 0, 0]} />}
    </SimpleViewer>
  );
};

createRoot(document.getElementById('root')!).render(<Harness />);
