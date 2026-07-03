import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import {
  SimpleViewer,
  Hotspot,
  type SimpleViewerHandle,
  type ViewerPreset,
} from '../src';

/**
 * The render-smoke harness: a self-contained page (no network fetches) that
 * mounts the real viewer on a procedural model so Playwright can observe
 * actual WebGL pixels in CI. Scenarios are selected via query params:
 *   ?preset=studio|product|neutral|dark|outdoor   (default: none = defaults)
 *   ?hotspot=1                                    (anchor a hotspot at the origin)
 */
declare global {
  interface Window {
    __renderedFrames: number;
    __modelLoaded: boolean;
    __captureStill: () => Promise<string>;
  }
}

window.__renderedFrames = 0;
window.__modelLoaded = false;

const params = new URLSearchParams(window.location.search);
const preset = (params.get('preset') as ViewerPreset | null) ?? undefined;
const withHotspot = params.get('hotspot') === '1';

const makeModel = () => {
  const mesh = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1, 0.35, 128, 24),
    new THREE.MeshStandardMaterial({ color: '#c2410c', roughness: 0.35, metalness: 0.15 })
  );
  mesh.name = 'smoke-torus-knot';
  return mesh;
};

const Harness = () => {
  const viewerRef = useRef<SimpleViewerHandle>(null);
  const model = useRef(makeModel());

  useEffect(() => {
    const handle = viewerRef.current;
    if (!handle) {
      return;
    }
    // Read the ref at call time: the handle is recreated once the core viewer
    // initializes, and only the late one has a live captureStill.
    window.__captureStill = async () => viewerRef.current!.captureStill();
    const offRender = handle.events.on('render:complete', () => {
      window.__renderedFrames += 1;
    });
    const offLoaded = handle.events.on('model:loaded', () => {
      window.__modelLoaded = true;
    });
    return () => {
      offRender();
      offLoaded();
    };
  }, []);

  return (
    <SimpleViewer ref={viewerRef} object={model.current} preset={preset}>
      {withHotspot && <Hotspot position={[0, 0, 0]} />}
    </SimpleViewer>
  );
};

createRoot(document.getElementById('root')!).render(<Harness />);
