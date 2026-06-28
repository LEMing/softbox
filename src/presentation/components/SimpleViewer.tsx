import React, { useRef, useEffect, forwardRef, useImperativeHandle, useMemo, useCallback } from 'react';
import { SimpleViewerHandle, SimpleViewerProps } from '../../types';
import { ControlsInstance } from '../../types/CommonTypes';
import { useViewerCore, useViewerEventHandlers } from '../hooks';
import { ViewerProvider } from './ViewerContext';
import { ViewerCanvas } from './ViewerCanvas';
import { ViewerGizmo } from './ViewerGizmo';
import { ViewerErrorBoundary } from './ViewerErrorBoundary';
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
  ({ object, options = {} }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { viewer, isInitialized } = useViewerCore(canvasRef, options);
    const eventsRef = useRef<TypedEventEmitter<ViewerEventMap>>(
      new TypedEventEmitter()
    );

    // Create stable object reference for non-string objects
    const stableObjectRef = useRef<string | THREE.Object3D | null | undefined>(undefined);
    const objectKey = useMemo(() => {
      if (typeof object === 'string') {
        return object;
      } else if (object) {
        // For objects, use a combination of properties that identify it
        return `object-${object.uuid || 'no-uuid'}`;
      }
      return undefined;
    }, [object]);
    
    // Update ref when key changes
    useMemo(() => {
      stableObjectRef.current = object;
    }, [objectKey, object]);
    
    // Load object when provided and viewer is ready
    useEffect(() => {
      if (!viewer || !isInitialized || !stableObjectRef.current) {
        return;
      }

      // Load the object - handle Three.js objects by wrapping them
      const objectToLoad = typeof stableObjectRef.current === 'string' ? 
        stableObjectRef.current :
        new ThreeObject3DAdapter(stableObjectRef.current as THREE.Object3D);
      viewer.loadModel(objectToLoad).then((result) => {
        if (!result.ok) {
          console.error('Failed to load model:', result.error);
        }
      });
    }, [viewer, isInitialized, objectKey]); // Use objectKey instead of object

    // Memoize event handlers to prevent recreating on every render
    const eventHandlers = useMemo(() => ({
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
          </div>
        </ViewerProvider>
      </ViewerErrorBoundary>
    );
  }
);

SimpleViewer.displayName = 'SimpleViewer';
