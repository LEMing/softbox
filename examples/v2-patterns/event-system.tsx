/**
 * Example: Event System in ThreeDViewer v2.0
 * 
 * This example demonstrates the new type-safe event system:
 * - Subscribing to multiple events
 * - Event data types
 * - Cleanup patterns
 * - Custom event handlers
 */

import React, { useRef, useEffect, useState } from 'react';
import { SimpleViewer, SimpleViewerHandle } from 'threedviewer';
import * as THREE from 'three';

interface EventLog {
  type: string;
  data: any;
  timestamp: Date;
}

export function EventSystemExample() {
  const viewerRef = useRef<SimpleViewerHandle>(null);
  const [eventLog, setEventLog] = useState<EventLog[]>([]);
  const [stats, setStats] = useState({
    frameCount: 0,
    lastRenderTime: 0,
    controlsChanges: 0
  });

  // Helper to log events
  const logEvent = (type: string, data: any) => {
    setEventLog(prev => [...prev.slice(-20), { type, data, timestamp: new Date() }]);
  };

  useEffect(() => {
    if (!viewerRef.current) return;

    const events = viewerRef.current.events;
    const unsubscribers: Array<() => void> = [];

    // Lifecycle events
    unsubscribers.push(
      events.on('initialized', ({ viewer }) => {
        logEvent('initialized', { viewer: 'SimpleViewer instance' });
        console.log('Viewer initialized with refs:', {
          hasScene: !!viewer.scene,
          hasCamera: !!viewer.camera,
          hasRenderer: !!viewer.renderer
        });
      })
    );

    // Model loading events
    unsubscribers.push(
      events.on('model:loading', ({ url }) => {
        logEvent('model:loading', { url });
      })
    );

    unsubscribers.push(
      events.on('model:loaded', ({ model, loadTime }) => {
        logEvent('model:loaded', { 
          modelName: model.name || 'Unnamed',
          loadTime: `${loadTime}ms`,
          vertexCount: countVertices(model)
        });
      })
    );

    unsubscribers.push(
      events.on('model:error', ({ error, url }) => {
        logEvent('model:error', { 
          url,
          errorCode: error.code,
          message: error.message 
        });
      })
    );

    // Rendering events (throttled for performance)
    let frameCount = 0;
    let lastLogTime = Date.now();
    
    unsubscribers.push(
      events.on('render:start', ({ frame }) => {
        frameCount++;
        
        // Log every second instead of every frame
        const now = Date.now();
        if (now - lastLogTime > 1000) {
          logEvent('render:stats', { 
            fps: Math.round(frameCount / ((now - lastLogTime) / 1000)),
            totalFrames: frame 
          });
          frameCount = 0;
          lastLogTime = now;
        }
      })
    );

    unsubscribers.push(
      events.on('render:complete', ({ frame, renderTime }) => {
        setStats(prev => ({
          ...prev,
          frameCount: frame,
          lastRenderTime: renderTime
        }));
      })
    );

    // Control events
    unsubscribers.push(
      events.on('controls:change', ({ type, camera }) => {
        setStats(prev => ({
          ...prev,
          controlsChanges: prev.controlsChanges + 1
        }));
        
        // Log camera position periodically
        if (stats.controlsChanges % 10 === 0) {
          logEvent('controls:change', {
            type,
            cameraPosition: camera.position.toArray().map(n => n.toFixed(2))
          });
        }
      })
    );

    // Screenshot events
    unsubscribers.push(
      events.on('screenshot:captured', ({ dataUrl }) => {
        logEvent('screenshot:captured', { 
          size: `${dataUrl.length} bytes`,
          preview: dataUrl.substring(0, 50) + '...'
        });
      })
    );

    // Error events
    unsubscribers.push(
      events.on('error', ({ error }) => {
        logEvent('error', {
          code: error.code,
          message: error.message,
          context: error.context
        });
      })
    );

    // Custom event handler example
    const handleOnce = events.once('model:loaded', ({ model }) => {
      console.log('First model loaded (once):', model.name);
      
      // Perform one-time setup
      if (viewerRef.current?.scene) {
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(5, 5, 5);
        viewerRef.current.scene.add(light);
        logEvent('custom:setup', { action: 'Added extra light on first load' });
      }
    });
    
    unsubscribers.push(handleOnce);

    // Cleanup all subscriptions
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, []);

  // Helper function to count vertices
  const countVertices = (object: THREE.Object3D): number => {
    let count = 0;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        count += child.geometry.attributes.position?.count || 0;
      }
    });
    return count;
  };

  // Action handlers
  const loadSampleModel = () => {
    viewerRef.current?.loadModel('/models/sample.glb');
  };

  const captureScreenshot = async () => {
    if (viewerRef.current) {
      const dataUrl = await viewerRef.current.captureScreenshot();
      
      // Create download link
      const link = document.createElement('a');
      link.download = `screenshot-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    }
  };

  const toggleRendering = () => {
    if (viewerRef.current) {
      // This will trigger render events
      viewerRef.current.startRendering();
      setTimeout(() => {
        viewerRef.current?.stopRendering();
      }, 2000);
    }
  };

  return (
    <div style={{ display: 'flex', height: '600px' }}>
      {/* Viewer */}
      <div style={{ flex: 1, position: 'relative' }}>
        <SimpleViewer
          ref={viewerRef}
          backgroundColor="#2a2a2a"
          render={{ antialias: true }}
          camera={{ position: [5, 5, 5] }}
          controls={{ enableDamping: true }}
          helpers={{ 
            axes: true,
            grid: true,
            stats: true 
          }}
        />
        
        {/* Stats overlay */}
        <div style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          background: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '10px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          <div>Frames: {stats.frameCount}</div>
          <div>Render Time: {stats.lastRenderTime.toFixed(2)}ms</div>
          <div>Controls Changes: {stats.controlsChanges}</div>
        </div>
      </div>

      {/* Event log panel */}
      <div style={{
        width: '300px',
        background: '#f5f5f5',
        padding: '10px',
        overflowY: 'auto'
      }}>
        <h3>Event Log</h3>
        
        <div style={{ marginBottom: '10px' }}>
          <button onClick={loadSampleModel}>Load Model</button>
          <button onClick={captureScreenshot}>Screenshot</button>
          <button onClick={toggleRendering}>Toggle Render</button>
          <button onClick={() => setEventLog([])}>Clear Log</button>
        </div>

        <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
          {eventLog.map((event, i) => (
            <div
              key={i}
              style={{
                marginBottom: '5px',
                padding: '5px',
                background: 'white',
                border: '1px solid #ddd',
                borderRadius: '3px'
              }}
            >
              <div style={{ fontWeight: 'bold', color: '#0066cc' }}>
                {event.type}
              </div>
              <div style={{ fontSize: '10px', color: '#666' }}>
                {event.timestamp.toLocaleTimeString()}
              </div>
              <pre style={{ margin: 0, fontSize: '10px', overflow: 'hidden' }}>
                {JSON.stringify(event.data, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Example: Custom event patterns
export function CustomEventPatterns() {
  const viewerRef = useRef<SimpleViewerHandle>(null);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);

  useEffect(() => {
    if (!viewerRef.current) return;

    const events = viewerRef.current.events;
    
    // Pattern 1: Combining multiple events
    let loadStartTime: number;
    
    const unsubscribeLoading = events.on('model:loading', () => {
      loadStartTime = Date.now();
    });
    
    const unsubscribeLoaded = events.on('model:loaded', ({ model }) => {
      const duration = Date.now() - loadStartTime;
      console.log(`Load completed in ${duration}ms for ${model.name}`);
      
      // Analyze model after loading
      analyzeModel(model);
    });

    // Pattern 2: Event-driven state management
    const unsubscribeSelection = events.on('object:selected', ({ object }) => {
      setSelectedObject(object.name || object.uuid);
      
      // Highlight selected object
      if (object instanceof THREE.Mesh) {
        object.material = new THREE.MeshBasicMaterial({ 
          color: 0xff0000,
          wireframe: true 
        });
      }
    });

    // Pattern 3: Error recovery with events
    const unsubscribeError = events.on('error', ({ error }) => {
      if (error.code === 'MODEL_LOAD_FAILED' && error.context?.url) {
        // Try fallback model
        const fallbackUrl = '/models/fallback.glb';
        console.log(`Loading fallback model after error: ${fallbackUrl}`);
        viewerRef.current?.loadModel(fallbackUrl);
      }
    });

    return () => {
      unsubscribeLoading();
      unsubscribeLoaded();
      unsubscribeSelection();
      unsubscribeError();
    };
  }, []);

  const analyzeModel = (model: THREE.Object3D) => {
    const meshes: THREE.Mesh[] = [];
    const materials = new Set<THREE.Material>();
    
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshes.push(child);
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => materials.add(m));
          } else {
            materials.add(child.material);
          }
        }
      }
    });

    console.log('Model analysis:', {
      meshCount: meshes.length,
      materialCount: materials.size,
      boundingBox: new THREE.Box3().setFromObject(model)
    });
  };

  return (
    <div>
      <SimpleViewer ref={viewerRef} />
      {selectedObject && (
        <div>Selected: {selectedObject}</div>
      )}
    </div>
  );
}