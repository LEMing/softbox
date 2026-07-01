import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle, useMemo, useCallback } from 'react';
import { SimpleViewerHandle, SimpleViewerProps } from '../../types';
import { ControlsInstance } from '../../types/CommonTypes';
import { useViewerCore, useViewerEventHandlers } from '../hooks';
import { ViewerProvider } from './ViewerContext';
import { ViewerCanvas } from './ViewerCanvas';
import { ViewerGizmo } from './ViewerGizmo';
import { ViewerErrorBoundary } from './ViewerErrorBoundary';
import { LoadingOverlay } from './LoadingOverlay';
import { resolveLoadingIndicator } from './loadingIndicatorConfig';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { ViewerEventMap } from '../../events/ViewerEvents';
import { ViewerEventMap as CoreViewerEventMap } from '../../core/events/ViewerEvents';
import { ThreeObject3DAdapter } from '../../infrastructure/three/ThreeObject3D';
import { EventAdapter } from '../adapters/EventAdapter';
import * as THREE from 'three';

/**
 * Refactored SimpleViewer component using clean architecture
 * Maintains backward compatibility with existing API
 */
export const SimpleViewer = forwardRef<SimpleViewerHandle, SimpleViewerProps>(
  ({ object, options = {}, preset }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // The `preset` prop is shorthand for `options.preset`; an explicit
    // `options.preset` wins if both are provided.
    const resolvedOptions = useMemo(
      () => (preset !== undefined && options.preset === undefined ? { ...options, preset } : options),
      [options, preset]
    );
    const { viewer, isInitialized } = useViewerCore(canvasRef, resolvedOptions);
    const eventsRef = useRef<TypedEventEmitter<ViewerEventMap>>(
      new TypedEventEmitter()
    );

    // Identity key for the object: its string URL, or a uuid-based key for
    // Three.js objects, so the load effect only re-runs on a real change.
    const objectKey = useMemo(() => {
      if (typeof object === 'string') {
        return object;
      } else if (object) {
        return `object-${object.uuid || 'no-uuid'}`;
      }
      return undefined;
    }, [object]);

    // Loading state drives the built-in overlay. A model that is provided but not
    // yet on screen counts as loading from the very first frame (no blank scene).
    const [loadState, setLoadState] = useState<{
      status: 'idle' | 'loading' | 'loaded' | 'error';
      error?: string;
    }>(() => ({ status: object ? 'loading' : 'idle' }));

    // Reset to loading the moment a new object identity arrives.
    useEffect(() => {
      setLoadState({ status: object ? 'loading' : 'idle' });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on objectKey (object's stable identity), not the object reference.
    }, [objectKey]);

    // Load object when provided and viewer is ready. Keyed on objectKey so a new
    // object identity with the same key does not trigger a reload.
    useEffect(() => {
      if (!viewer || !isInitialized || !object) {
        return;
      }

      let active = true;
      const objectToLoad = typeof object === 'string'
        ? object
        : new ThreeObject3DAdapter(object as THREE.Object3D);
      viewer.loadModel(objectToLoad).then((result) => {
        // A newer object superseded this load — don't write its (now stale) result.
        if (!active) {
          return;
        }
        if (result.ok) {
          setLoadState({ status: 'loaded' });
        } else {
          setLoadState({ status: 'error', error: result.error.message });
          console.error('Failed to load model:', result.error);
        }
      });
      return () => {
        active = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- objectKey is the stable identity of `object`; depending on `object` would reload on every new reference with the same key.
    }, [viewer, isInitialized, objectKey]);

    // Memoize event handlers to prevent recreating on every render
    const eventHandlers = useMemo(() => ({
      'model:loading': (data: CoreViewerEventMap['model:loading']) =>
        eventsRef.current.emit('model:loading', data),
      'model:loaded': (data: CoreViewerEventMap['model:loaded']) =>
        eventsRef.current.emit('model:loaded', EventAdapter.convertModelLoaded(data)),
      'model:error': (data: CoreViewerEventMap['model:error']) => 
        eventsRef.current.emit('model:error', data),
      'render:complete': (data: CoreViewerEventMap['render:complete']) => 
        eventsRef.current.emit('render:complete', data),
      'controls:change': (data: CoreViewerEventMap['controls:change']) => 
        eventsRef.current.emit('controls:change', EventAdapter.convertControlsChange(data)),
      'error': (data: CoreViewerEventMap['error']) => 
        eventsRef.current.emit('error', data),
    }), []); // Empty deps as eventsRef is stable
    
    // Forward events from ViewerCore to external events
    useViewerEventHandlers(viewer, eventHandlers);

    // Helpers to unwrap the underlying Three.js object from a core adapter.
    const unwrapScene = useCallback((adapter: unknown): THREE.Scene | null => {
      if (adapter && typeof adapter === 'object') {
        const obj = adapter as Record<string, unknown>;
        if (typeof obj.getThreeScene === 'function') {
          return obj.getThreeScene() as THREE.Scene;
        }
      }
      return null;
    }, []);

    const unwrapCamera = useCallback((adapter: unknown): THREE.Camera | null => {
      if (adapter && typeof adapter === 'object') {
        const obj = adapter as Record<string, unknown>;
        if (typeof obj.getThreeCamera === 'function') {
          return obj.getThreeCamera() as THREE.Camera;
        }
      }
      return null;
    }, []);

    const unwrapRenderer = useCallback((adapter: unknown): THREE.WebGLRenderer | null => {
      if (adapter && typeof adapter === 'object') {
        const obj = adapter as Record<string, unknown>;
        if (typeof obj.getThreeRenderer === 'function') {
          return obj.getThreeRenderer() as THREE.WebGLRenderer;
        }
      }
      return null;
    }, []);

    const unwrapControls = useCallback((adapter: unknown): ControlsInstance | null => {
      if (adapter && typeof adapter === 'object') {
        const obj = adapter as Record<string, unknown>;
        if (typeof obj.getThreeControls === 'function') {
          return obj.getThreeControls() as ControlsInstance;
        }
      }
      return null;
    }, []);

    // Get Three.js objects for gizmo via ViewerCore's public accessors.
    const camera = viewer ? unwrapCamera(viewer.getCamera()) : null;
    const controls = viewer ? unwrapControls(viewer.getControls()) : null;
    const renderer = viewer ? unwrapRenderer(viewer.getRenderer()) : null;

    // Render function for gizmo
    const renderScene = useCallback(() => {
      viewer?.requestRender();
    }, [viewer]);

    // Check if gizmo is enabled
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

    // Expose imperative handle for backward compatibility
    useImperativeHandle(ref, () => {
      return {
        scene: viewer ? unwrapScene(viewer.getScene()) : null,
        camera,
        renderer,
        controls,
        events: eventsRef.current,
        loadModel: async (source: string | THREE.Object3D): Promise<void> => {
          if (!viewer) {
            return;
          }
          const toLoad = typeof source === 'string'
            ? source
            : new ThreeObject3DAdapter(source);
          const result = await viewer.loadModel(toLoad);
          if (!result.ok) {
            throw result.error;
          }
        },
        dispose: () => {
          viewer?.dispose();
        },
      };
    }, [viewer, camera, renderer, controls, unwrapScene]);

    // Always render the canvas, even if viewer is not ready
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
          </div>
        </ViewerProvider>
      </ViewerErrorBoundary>
    );
  }
);

SimpleViewer.displayName = 'SimpleViewer';
