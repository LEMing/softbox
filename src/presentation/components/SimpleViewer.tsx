import React, {
  useRef,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { SimpleViewerHandle, SimpleViewerProps } from '../../types';
import { CaptureStillOptions, CaptureVideoOptions } from '../../types/SimpleViewerHandle';
import {
  useViewerCore,
  usePickedPreset,
  useResolvedOptions,
  useModelLoader,
  useForwardedEvents,
  useOptionCallbacks,
} from '../hooks';
import { ViewerProvider } from './ViewerContext';
import { ViewerCanvas } from './ViewerCanvas';
import { ViewerGizmo } from './ViewerGizmo';
import { ViewerErrorBoundary } from './ViewerErrorBoundary';
import { LoadingOverlay } from './LoadingOverlay';
import { PresetPicker } from './PresetPicker';
import { ArButton } from './ArButton';
import { PosterOverlay } from './PosterOverlay';
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
    const { viewer, isInitialized, initError } = useViewerCore(canvasRef, resolvedOptions);

    const loadState = useModelLoader(viewer, isInitialized, object);
    const events = useForwardedEvents(viewer);
    useOptionCallbacks(viewer, initError, options);

    // Three.js objects for the gizmo and handle, via ViewerCore's accessors.
    const camera = viewer ? toThreeCamera(viewer.getCamera()) : null;
    const controls = viewer ? toThreeControls(viewer.getControls()) : null;
    const renderer = viewer ? toThreeRenderer(viewer.getRenderer()) : null;

    const renderScene = useCallback(() => {
      viewer?.requestRender();
    }, [viewer]);

    const isGizmoEnabled = options.helpers?.gizmo !== undefined && options.helpers.gizmo !== false;
    const gizmoOptions = typeof options.helpers?.gizmo === 'object' ? options.helpers.gizmo : {};

    // AR handoff is UI-only chrome, read live off the raw options like `ui`.
    const arOptions = options.ar === true ? {} : options.ar || null;
    // The AR button must hand off the model that is ON STAGE, which the
    // `object` prop stops describing after an imperative handle.loadModel()
    // swap — track the engine's own record of the loaded URL instead. The
    // prop is only the pre-first-load fallback.
    const [loadedModelUrl, setLoadedModelUrl] = useState<string | null>(null);
    useEffect(() => {
      if (!viewer) {
        setLoadedModelUrl(null);
        return;
      }
      const updateLoadedUrl = () => setLoadedModelUrl(viewer.getModelUrl());
      // A model may already be on stage (runtime-only remounts).
      updateLoadedUrl();
      events.on('model:loaded', updateLoadedUrl);
      return () => events.off('model:loaded', updateLoadedUrl);
    }, [viewer, events]);
    const arSource = loadedModelUrl ?? object;

    // The poster dismisses on the first frame PAINTED after the model
    // landed — model:loaded alone races the actual draw, and dropping the
    // poster a frame early flashes the empty stage.
    const posterSrc = options.poster || null;
    const [posterDismissed, setPosterDismissed] = useState(false);
    useEffect(() => {
      if (!posterSrc || posterDismissed) {
        return;
      }
      // A poster that arrives AFTER the model already loaded (async CMS URL,
      // a toggled option) has no future model:loaded to wait for — and the
      // render loop may have idled, so there is no future frame either. The
      // model demonstrably painted already: dismiss now. Status is read at
      // subscribe time only; the loading→loaded transition of a watched load
      // is delivered by the model:loaded event below, ahead of the deciding
      // paint.
      if (loadState.status === 'loaded') {
        setPosterDismissed(true);
        return;
      }
      let modelPainted = false;
      const onLoaded = () => {
        modelPainted = true;
      };
      const onRendered = () => {
        if (modelPainted) {
          setPosterDismissed(true);
        }
      };
      events.on('model:loaded', onLoaded);
      events.on('render:complete', onRendered);
      return () => {
        events.off('model:loaded', onLoaded);
        events.off('render:complete', onRendered);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- loadState.status is deliberately not a dep: re-running on loading→loaded would dismiss at load, before the first painted frame.
    }, [posterSrc, posterDismissed, events]);
    // Built-in loading overlay configuration (UI-only).
    const loadingIndicator = useMemo(
      () => resolveLoadingIndicator(options.loadingIndicator),
      [options.loadingIndicator]
    );
    const hasError = loadState.status === 'error' || Boolean(initError);
    const showOverlay =
      loadingIndicator.enabled && (loadState.status === 'loading' || hasError);
    // A failed load keeps the poster up as the backdrop UNDER the error
    // overlay — but with the built-in overlay disabled that would read as a
    // frozen viewer, so the poster steps aside for the consumer's own chrome.
    const posterVisible = !posterDismissed && !(hasError && !loadingIndicator.enabled);

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
        getVariantNames: () => viewer?.getVariantNames() ?? [],
        setVariant: (variant: string | null) => {
          if (!viewer) {
            throw notReadyError();
          }
          const result = viewer.setMaterialVariant(variant);
          if (!result.ok) {
            throw result.error;
          }
        },
        playAnimations: (clipName?: string) => {
          if (!viewer) {
            throw notReadyError();
          }
          const result = viewer.playAnimations(clipName);
          if (!result.ok) {
            throw result.error;
          }
        },
        pauseAnimations: () => {
          viewer?.pauseAnimations();
        },
        setEnvironmentMap: async (url: string): Promise<void> => {
          if (!viewer) {
            throw notReadyError();
          }
          const result = await viewer.setEnvironmentMap(url);
          if (!result.ok) {
            throw result.error;
          }
        },
        resetEnvironment: (): void => {
          if (!viewer) {
            throw notReadyError();
          }
          const result = viewer.resetEnvironment();
          if (!result.ok) {
            throw result.error;
          }
        },
        setBackgroundImage: async (source: string | File | HTMLImageElement): Promise<void> => {
          if (!viewer) {
            throw notReadyError();
          }
          const result = await viewer.setBackgroundImage(source);
          if (!result.ok) {
            throw result.error;
          }
        },
        setBackgroundColor: (color: string | number): void => {
          if (!viewer) {
            throw notReadyError();
          }
          const result = viewer.setBackgroundColor(color);
          if (!result.ok) {
            throw result.error;
          }
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
                status={hasError ? 'error' : 'loading'}
                label={
                  hasError
                    ? (loadingIndicator.errorLabel ??
                        initError?.message ??
                        loadState.error ??
                        'Failed to load model')
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
            {arOptions && (
              <ArButton source={arSource} options={arOptions} clearPresetRow={pickerEnabled} />
            )}
            {posterSrc && <PosterOverlay src={posterSrc} visible={posterVisible} />}
            {children}
          </div>
        </ViewerProvider>
      </ViewerErrorBoundary>
    );
  }
);

SimpleViewer.displayName = 'SimpleViewer';
