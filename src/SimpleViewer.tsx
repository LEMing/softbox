import React, {useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef} from 'react';
import * as THREE from 'three';
import {MapControls} from 'three/examples/jsm/controls/MapControls';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {Gizmo} from 'threedgizmo';
import {loadModel} from './loadModel';

import {cleanupScene} from './ThreeSceneSetup/cleanupScene';
import {TIME_PER_FRAME} from './ThreeSceneSetup/constants';
import {SceneManager} from './ThreeSceneSetup/setupScene/SceneManager';
import {updateSize} from './ThreeSceneSetup/updateSize';
import {SimpleViewerProps, SimpleViewerOptions, LoaderGLB} from './types';
import {throttle} from './utils';
import defaultOptions from './defaultOptions';
import { ThreeViewerError, ErrorCode } from './errors';
import { TypedEventEmitter, ViewerEventMap } from './events';
import { OptionsValidator } from './validation/OptionsValidator';
import { checkDeprecatedProps, mapDeprecatedProps } from './utils/deprecation';

export interface SimpleViewerHandle {
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: OrbitControls | MapControls | null;
  events: TypedEventEmitter<ViewerEventMap>;
  loadModel: (url: string) => Promise<void>;
  startRendering: () => void;
  stopRendering: () => void;
  captureScreenshot: () => Promise<string>;
}

const SimpleViewer = forwardRef<SimpleViewerHandle, SimpleViewerProps>((props, externalRef) => {
  // Check for deprecated props
  useEffect(() => {
    checkDeprecatedProps(props as any);
  }, []);

  // Map deprecated props if needed
  const mappedProps = mapDeprecatedProps(props as any);
  const { object, options = defaultOptions } = mappedProps as SimpleViewerProps;

  // For now, we'll use the old options format directly until we complete the migration
  // Only use external refs if they have a proper ref structure
  const isValidRef = (ref: any) => ref && typeof ref === 'object' && 'current' in ref && Object.getPrototypeOf(ref) !== Object.prototype;
  
  const mountRef = (isValidRef(options.threeBaseRefs?.mountPoint) ? options.threeBaseRefs.mountPoint : useRef<HTMLDivElement | null>(null)) as React.MutableRefObject<HTMLDivElement | null>;
  const rendererRef = (isValidRef(options.threeBaseRefs?.renderer) ? options.threeBaseRefs.renderer : useRef<THREE.WebGLRenderer | null>(null)) as React.MutableRefObject<THREE.WebGLRenderer | null>;
  const cameraRef = (isValidRef(options.threeBaseRefs?.camera) ? options.threeBaseRefs.camera : useRef<THREE.Camera | null>(null)) as React.MutableRefObject<THREE.Camera | null>;
  const sceneRef = (isValidRef(options.threeBaseRefs?.scene) ? options.threeBaseRefs.scene : useRef<THREE.Scene | null>(null)) as React.MutableRefObject<THREE.Scene | null>;
  const controlsRef = (isValidRef(options.threeBaseRefs?.controls) ? options.threeBaseRefs.controls : useRef<OrbitControls | MapControls | null>(null)) as React.MutableRefObject<OrbitControls | MapControls | null>;

  const initModel = () => {
    if (typeof object === 'string') {
      return null;
    } else {
      return object
    }
  }

  const [inputModelObject, setInputModelObject] = useState<THREE.Object3D | null>(initModel());
  const [error, setError] = useState<ThreeViewerError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [forceUpdate, setForceUpdate] = useState(0);
  const [completedImage, setRenderCompleteImage] = useState<string | null>(null);
  const [sceneManager, setSceneManager] = useState<SceneManager | null>(null);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const frameCountRef = useRef(0);
  
  // Initialize event emitter
  const events = useMemo(() => new TypedEventEmitter<ViewerEventMap>(), []);
  
  // Define methods for imperative handle
  const loadModelMethod = useCallback(async (url: string) => {
    setIsLoading(true);
    setError(null);
    
    events.emit('model:loading', { url });
    const startTime = Date.now();
    
    try {
      const loader = new GLTFLoader();
      const model = await loadModel(url, loader as LoaderGLB);
      setInputModelObject(model);
      setForceUpdate(prev => prev + 1);
      
      events.emit('model:loaded', { 
        model, 
        loadTime: Date.now() - startTime 
      });
    } catch (err) {
      const error = ThreeViewerError.fromError(
        err,
        ErrorCode.MODEL_LOAD_FAILED,
        { url }
      );
      setError(error);
      console.error('Failed to load model:', error);
      
      events.emit('model:error', { error, url });
      events.emit('error', { error });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [events]);

  const startRenderingMethod = useCallback(() => {
    if (sceneManager) {
      events.emit('render:start', { frame: frameCountRef.current });
      sceneManager.onStartRendering();
    }
  }, [sceneManager, events]);

  const stopRenderingMethod = useCallback(() => {
    if (sceneManager) {
      // The SceneManager doesn't expose a stopRendering method directly,
      // but we can achieve this by not calling onStartRendering
      // For now, just emit the event
      events.emit('render:complete', { 
        frame: frameCountRef.current,
        renderTime: 0
      });
    }
  }, [sceneManager, events]);

  const captureScreenshotMethod = useCallback(async (): Promise<string> => {
    if (!rendererRef.current) {
      throw new ThreeViewerError(
        'Renderer not initialized',
        ErrorCode.COMPONENT_NOT_MOUNTED
      );
    }
    
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    events.emit('screenshot:captured', { dataUrl });
    return dataUrl;
  }, [events]);

  // Expose refs and events through imperative handle
  useImperativeHandle(externalRef, () => ({
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    controls: controlsRef.current,
    events,
    loadModel: loadModelMethod,
    startRendering: startRenderingMethod,
    stopRendering: stopRenderingMethod,
    captureScreenshot: captureScreenshotMethod,
  }), [events, loadModelMethod, startRenderingMethod, stopRenderingMethod, captureScreenshotMethod]);

  // Model loading with proper error handling
  useEffect(() => {
    const loadModelAsync = async () => {
      if (typeof object === 'string') {
        setIsLoading(true);
        setError(null);
        
        events.emit('model:loading', { url: object });
        const startTime = Date.now();
        
        try {
          const loader = new GLTFLoader();
          const model = await loadModel(object, loader as LoaderGLB);
          setInputModelObject(model);
          setForceUpdate(prev => prev + 1);
          
          events.emit('model:loaded', { 
            model, 
            loadTime: Date.now() - startTime 
          });
        } catch (err) {
          const error = ThreeViewerError.fromError(
            err,
            ErrorCode.MODEL_LOAD_FAILED,
            { url: object }
          );
          setError(error);
          console.error('Failed to load model:', error);
          
          events.emit('model:error', { error, url: object });
          events.emit('error', { error });
        } finally {
          setIsLoading(false);
        }
      } else {
        setInputModelObject(object);
      }
    };

    loadModelAsync();
  }, [object, events]);

  const mergedOptions = useMemo<SimpleViewerOptions>(() => {
    // Simply merge options with defaults - the old and new formats are compatible
    const merged = {
      ...defaultOptions,
      ...options,
    };

    // Validate options
    const validationResult = OptionsValidator.validate(merged);
    if (!validationResult.ok) {
      console.error('SimpleViewer: Invalid options detected:', validationResult.error.message);
      if (validationResult.error.context?.errors) {
        console.error('Validation errors:', OptionsValidator.formatErrors(validationResult.error.context.errors));
      }
      // Use default options as fallback for invalid configuration
      return defaultOptions;
    }

    return merged;
  }, [options]);

  const resize = useCallback(() => {
    // Check all required refs before resize
    if (!rendererRef.current || !cameraRef.current || !sceneRef.current || !mountRef.current) {
      console.warn('Cannot resize: Some refs are not initialized');
      return;
    }
    
    updateSize(
      rendererRef.current,
      cameraRef.current,
      mountRef,
      sceneRef.current
    );
  }, []);

  // Scene setup with error handling
  useEffect(() => {
    if (!mountRef.current) return;
    if (!inputModelObject && typeof object === 'string') return; // Wait for model load
    
    const resizeHandler = throttle(resize, TIME_PER_FRAME);
    const threeBase = { mountRef, rendererRef, cameraRef, sceneRef };

    try {
      const sceneManagerInstance = new SceneManager(threeBase, inputModelObject, mergedOptions, setRenderCompleteImage);
      setSceneManager(sceneManagerInstance);

      const {
        renderer,
        scene,
        camera,
        controls,
      } = sceneManagerInstance.getSceneElements();

      // Store references (only if we created our own refs)
      if (!isValidRef(options.threeBaseRefs?.renderer)) rendererRef.current = renderer;
      if (!isValidRef(options.threeBaseRefs?.scene)) sceneRef.current = scene;
      if (!isValidRef(options.threeBaseRefs?.camera)) cameraRef.current = camera;
      if (!isValidRef(options.threeBaseRefs?.controls)) controlsRef.current = controls;

      resize(); // Initial size update
      setIsSceneReady(true); // Mark scene as ready
      
      // Emit initialized event  
      events.emit('initialized', { 
        viewer: {
          scene: sceneRef.current,
          camera: cameraRef.current,
          renderer: rendererRef.current,
          controls: controlsRef.current,
          events,
          loadModel: loadModelMethod,
          startRendering: startRenderingMethod,
          stopRendering: stopRenderingMethod,
          captureScreenshot: captureScreenshotMethod
        } as SimpleViewerHandle
      });

      window.addEventListener('resize', resizeHandler);
      
      return () => {
        setIsSceneReady(false);
        events.emit('disposed', { 
          viewer: {
            scene: sceneRef.current,
            camera: cameraRef.current,
            renderer: rendererRef.current,
            controls: controlsRef.current,
            events,
            loadModel: loadModelMethod,
            startRendering: startRenderingMethod,
            stopRendering: stopRenderingMethod,
            captureScreenshot: captureScreenshotMethod
          } as SimpleViewerHandle
        });
        cleanupScene(mountRef, renderer, resizeHandler);
      };
    } catch (err) {
      const error = ThreeViewerError.fromError(
        err,
        ErrorCode.SCENE_INIT_FAILED,
        { options: mergedOptions }
      );
      setError(error);
      console.error('Failed to initialize scene:', error);
      
      events.emit('error', { error });
    }
  }, [object, mergedOptions, resize, inputModelObject, events]);

  const render = useCallback(() => {
    if (!rendererRef.current || !controlsRef.current || !sceneRef.current || !cameraRef.current) {
      return;
    }

    frameCountRef.current += 1;
    const frameNumber = frameCountRef.current;
    
    events.emit('render:start', { frame: frameNumber });
    const startTime = performance.now();

    try {
      controlsRef.current.update();

      if (mergedOptions.usePathTracing && sceneManager?.pathTracingManager) {
        const updateResult = sceneManager.pathTracingManager.updatePathTracerRenderer();
        if (updateResult.ok) {
          sceneManager.pathTracingManager.ptRenderer?.renderSample();
        } else {
          // Fallback to standard rendering if path tracing fails
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      } else {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      
      const renderTime = performance.now() - startTime;
      events.emit('render:complete', { frame: frameNumber, renderTime });
    } catch (err) {
      const error = ThreeViewerError.fromError(
        err,
        ErrorCode.RENDER_ERROR,
        { usePathTracing: mergedOptions.usePathTracing }
      );
      console.error('Render error:', error);
      // Don't set error state here as it would cause re-render loop
    }
  }, [sceneManager, mergedOptions.usePathTracing, events]);

  // Error display
  if (error) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f8f8f8',
        color: '#333',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div>
          <h3>Error Loading 3D Viewer</h3>
          <p>{error.message}</p>
          {error.code === ErrorCode.MODEL_LOAD_FAILED && (
            <p style={{ fontSize: '0.9em', color: '#666' }}>
              Please check the model URL and try again.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f8f8f8'
      }}>
        <div>Loading 3D model...</div>
      </div>
    );
  }

  if (mergedOptions.replaceWithScreenshotOnComplete && completedImage) {
    return <img src={completedImage} alt="Render Complete" />;
  }

  return (
    <>
      {isSceneReady && mergedOptions.helpers.addGizmo && cameraRef.current && controlsRef.current ? (
        <Gizmo
          camera={cameraRef.current}
          controls={controlsRef.current}
          render={render}
        />
      ) : null}
      <div style={{ width: '100%', height: '100%' }} ref={mountRef} />
    </>
  );
});

SimpleViewer.displayName = 'SimpleViewer';

export default SimpleViewer;