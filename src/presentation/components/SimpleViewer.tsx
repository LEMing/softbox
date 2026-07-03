import React, { useRef, forwardRef, useImperativeHandle, useMemo, useCallback } from 'react';
import { SimpleViewerHandle, SimpleViewerProps } from '../../types';
import { CaptureStillOptions, CaptureVideoOptions } from '../../types/SimpleViewerHandle';
import {
  useViewerCore,
  usePickedPreset,
  useResolvedOptions,
  useModelLoader,
  useForwardedEvents,
} from '../hooks';
import { ViewerProvider } from './ViewerContext';
import { ViewerCanvas } from './ViewerCanvas';
import { ViewerGizmo } from './ViewerGizmo';
import { ViewerErrorBoundary } from './ViewerErrorBoundary';
import { LoadingOverlay } from './LoadingOverlay';
import { PresetPicker } from './PresetPicker';
import { resolveLoadingIndicator } from './loadingIndicatorConfig';
import { ThreeObject3DAdapter } from '../../infrastructure/three/ThreeObject3D';
import {
  toThreeCamera,
  toThreeControls,
  toThreeRenderer,
  toThreeScene,
} from '../../infrastructure/three/unwrap';
import { ThreeViewerError, ErrorCode } from '../../errors';
import * as THREE from 'three';

const notReadyError = () =>
  new ThreeViewerError('Viewer is not ready yet', ErrorCode.COMPONENT_NOT_MOUNTED);

/**
 * The public viewer component. It is a thin composition over focused hooks —
 * preset-picker state (`usePickedPreset`), prop-shorthand folding
 * (`useResolvedOptions`), the engine (`useViewerCore`), model loading
 * (`useModelLoader`) and event forwarding (`useForwardedEvents`) — plus the
 * imperative handle and the overlay chrome.
 */
export const SimpleViewer = forwardRef<SimpleViewerHandle, SimpleViewerProps>(
  ({ object, options = {}, preset, pathTraced, turntable, animations, children }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // The `preset` prop is shorthand for `options.preset`; an explicit
    // `options.preset` wins if both are provided.
    const consumerPreset = options.preset ?? preset;
    const { activePreset, pickerEnabled, selectPreset } = usePickedPreset(
      consumerPreset,
      options.ui
    );

    const resolvedOptions = useResolvedOptions(
      options,
      activePreset,
      pathTraced,
      turntable,
      animations
    );
    const { viewer, isInitialized } = useViewerCore(canvasRef, resolvedOptions);

    const loadState = useModelLoader(viewer, isInitialized, object);
    const events = useForwardedEvents(viewer);

    // Three.js objects for the gizmo and handle, via ViewerCore's accessors.
    const camera = viewer ? toThreeCamera(viewer.getCamera()) : null;
    const controls = viewer ? toThreeControls(viewer.getControls()) : null;
    const renderer = viewer ? toThreeRenderer(viewer.getRenderer()) : null;

    const renderScene = useCallback(() => {
      viewer?.requestRender();
    }, [viewer]);

    const isGizmoEnabled = options.helpers?.gizmo !== undefined && options.helpers.gizmo !== false;
    const gizmoOptions = typeof options.helpers?.gizmo === 'object' ? options.helpers.gizmo : {};

    // Built-in loading overlay configuration (UI-only).
    const loadingIndicator = useMemo(
      () => resolveLoadingIndicator(options.loadingIndicator),
      [options.loadingIndicator]
    );
    const showOverlay =
      loadingIndicator.enabled &&
      (loadState.status === 'loading' || loadState.status === 'error');

    useImperativeHandle(ref, () => {
      return {
        scene: viewer ? toThreeScene(viewer.getScene()) : null,
        camera,
        renderer,
        controls,
        events,
        loadModel: async (source: string | THREE.Object3D): Promise<void> => {
          if (!viewer) {
            throw notReadyError();
          }
          const toLoad = typeof source === 'string'
            ? source
            : new ThreeObject3DAdapter(source);
          const result = await viewer.loadModel(toLoad);
          if (!result.ok) {
            throw result.error;
          }
        },
        captureStill: async (captureOptions?: CaptureStillOptions): Promise<string> => {
          if (!viewer) {
            throw notReadyError();
          }
          const result = await viewer.captureStill(captureOptions);
          if (!result.ok) {
            throw result.error;
          }
          return result.value;
        },
        captureVideo: async (videoOptions?: CaptureVideoOptions): Promise<Blob> => {
          if (!viewer) {
            throw notReadyError();
          }
          const result = await viewer.captureVideo(videoOptions);
          if (!result.ok) {
            throw result.error;
          }
          return result.value;
        },
        getAnimationNames: () => viewer?.getAnimationNames() ?? [],
        playAnimations: (clipName?: string) => {
          if (!viewer) {
            throw notReadyError();
          }
          viewer.playAnimations(clipName);
        },
        pauseAnimations: () => {
          viewer?.pauseAnimations();
        },
        dispose: () => {
          viewer?.dispose();
        },
      };
    }, [viewer, camera, renderer, controls, events]);

    // Always render the canvas, even if the viewer is not ready.
    return (
      <ViewerErrorBoundary>
        <ViewerProvider viewer={viewer} canvasRef={canvasRef}>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <ViewerCanvas />
            {isGizmoEnabled && isInitialized && camera && controls && (
              <ViewerGizmo
                camera={camera}
                controls={controls}
                render={renderScene}
                placement={gizmoOptions.placement}
                size={gizmoOptions.size}
              />
            )}
            {showOverlay && (
              <LoadingOverlay
                status={loadState.status === 'error' ? 'error' : 'loading'}
                label={
                  loadState.status === 'error'
                    ? (loadingIndicator.errorLabel ?? loadState.error ?? 'Failed to load model')
                    : loadingIndicator.label
                }
                color={loadingIndicator.color}
                backdrop={loadingIndicator.backdrop}
              />
            )}
            {pickerEnabled && (
              /* The defaults ARE the studio look (pinned by presets.test.ts),
                 so with no preset set the studio chip is the honest active one. */
              <PresetPicker active={activePreset ?? 'studio'} onSelect={selectPreset} />
            )}
            {children}
          </div>
        </ViewerProvider>
      </ViewerErrorBoundary>
    );
  }
);

SimpleViewer.displayName = 'SimpleViewer';
