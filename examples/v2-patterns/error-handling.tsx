/**
 * Example: Error Handling in ThreeDViewer v2.0
 * 
 * This example demonstrates the new error handling patterns including:
 * - Event-based error handling
 * - Typed error codes
 * - Error context and recovery
 */

import React, { useRef, useEffect, useState } from 'react';
import { SimpleViewer, SimpleViewerHandle } from 'threedviewer';
import { ErrorCode } from 'threedviewer/errors';

export function ErrorHandlingExample() {
  const viewerRef = useRef<SimpleViewerHandle>(null);
  const [errors, setErrors] = useState<Array<{
    code: ErrorCode;
    message: string;
    timestamp: Date;
  }>>([]);
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!viewerRef.current) return;

    const events = viewerRef.current.events;

    // Subscribe to all error events
    const unsubscribeError = events.on('error', ({ error }) => {
      console.error(`[${error.code}] ${error.message}`, error.context);
      
      setErrors(prev => [...prev, {
        code: error.code,
        message: error.message,
        timestamp: new Date()
      }]);

      // Handle specific error types
      switch (error.code) {
        case ErrorCode.WEBGL_NOT_SUPPORTED:
          alert('WebGL is not supported in your browser. Please use a modern browser.');
          break;
          
        case ErrorCode.MODEL_LOAD_FAILED:
          // Could retry or show alternative content
          console.log('Model failed to load, context:', error.context);
          break;
          
        case ErrorCode.INVALID_CONFIGURATION:
          // Log validation errors
          const validationErrors = error.context?.errors;
          if (validationErrors) {
            console.error('Configuration errors:', validationErrors);
          }
          break;
      }
    });

    // Model loading state management
    const unsubscribeLoading = events.on('model:loading', ({ url }) => {
      setLoadingState('loading');
      console.log(`Loading model: ${url}`);
    });

    const unsubscribeLoaded = events.on('model:loaded', ({ model, loadTime }) => {
      setLoadingState('success');
      console.log(`Model loaded successfully in ${loadTime}ms`);
      
      // Access model properties
      const boundingBox = new THREE.Box3().setFromObject(model);
      const size = boundingBox.getSize(new THREE.Vector3());
      console.log('Model size:', size);
    });

    const unsubscribeModelError = events.on('model:error', ({ error, url }) => {
      setLoadingState('error');
      console.error(`Failed to load ${url}:`, error);
      
      // Could implement retry logic here
      setTimeout(() => {
        if (confirm(`Failed to load ${url}. Retry?`)) {
          viewerRef.current?.loadModel(url);
        }
      }, 100);
    });

    // Cleanup
    return () => {
      unsubscribeError();
      unsubscribeLoading();
      unsubscribeLoaded();
      unsubscribeModelError();
    };
  }, []);

  const loadTestModel = () => {
    viewerRef.current?.loadModel('/models/test.glb');
  };

  const loadInvalidModel = () => {
    // This will trigger an error
    viewerRef.current?.loadModel('/models/does-not-exist.glb');
  };

  const triggerConfigError = () => {
    // This would be caught during initialization
    console.log('Config errors are caught during component initialization');
  };

  return (
    <div style={{ width: '100%', height: '600px', position: 'relative' }}>
      {/* Error display overlay */}
      {errors.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: 'rgba(255, 0, 0, 0.1)',
          border: '1px solid red',
          padding: '10px',
          maxWidth: '300px',
          maxHeight: '200px',
          overflow: 'auto',
          zIndex: 1000
        }}>
          <h4>Errors ({errors.length})</h4>
          {errors.slice(-5).map((error, i) => (
            <div key={i} style={{ fontSize: '12px', marginBottom: '5px' }}>
              <strong>[{error.code}]</strong> {error.message}
              <br />
              <small>{error.timestamp.toLocaleTimeString()}</small>
            </div>
          ))}
        </div>
      )}

      {/* Loading state indicator */}
      {loadingState === 'loading' && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '20px',
          borderRadius: '5px',
          zIndex: 1000
        }}>
          Loading model...
        </div>
      )}

      {/* Control buttons */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000
      }}>
        <button onClick={loadTestModel}>Load Valid Model</button>
        <button onClick={loadInvalidModel}>Load Invalid Model</button>
        <button onClick={triggerConfigError}>Test Config Error</button>
        <button onClick={() => setErrors([])}>Clear Errors</button>
      </div>

      {/* Viewer with potential invalid config to demonstrate validation */}
      <SimpleViewer
        ref={viewerRef}
        backgroundColor="#1a1a1a"
        render={{
          antialias: true,
          shadowMap: true
        }}
        camera={{
          fov: 75, // Valid: 1-180
          position: [5, 5, 5]
        }}
        controls={{
          enableDamping: true,
          dampingFactor: 0.05
        }}
        helpers={{
          axes: true,
          grid: {
            size: 20,
            divisions: 20
          }
        }}
      />
    </div>
  );
}

// Example: Using with custom error boundary
export class ViewerErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Viewer crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#fee', border: '1px solid #fcc' }}>
          <h2>Something went wrong with the 3D viewer</h2>
          <details>
            <summary>Error details</summary>
            <pre>{this.state.error?.toString()}</pre>
          </details>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Usage with error boundary
export function SafeViewerExample() {
  return (
    <ViewerErrorBoundary>
      <ErrorHandlingExample />
    </ViewerErrorBoundary>
  );
}