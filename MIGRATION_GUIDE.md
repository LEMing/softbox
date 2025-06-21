# ThreeDViewer v2.0 Migration Guide

This guide helps you migrate from ThreeDViewer v1.x to v2.0, which introduces improved error handling, better type safety, and a more robust event system.

## Overview of Changes

### Major Improvements
- **Result-based error handling** throughout the codebase
- **Type-safe event system** with TypeScript support
- **Validated configuration options** with detailed error messages
- **Better error recovery** and graceful degradation
- **80%+ test coverage** for reliability

### Breaking Changes
- Manager initialization now returns `Result<T>` instead of throwing errors
- Event system API has changed
- Some configuration options have been reorganized
- Path tracing setup is now async

## Migration Steps

### 1. Update Error Handling

#### Before (v1.x)
```typescript
try {
  const viewer = new SimpleViewer(options);
  viewer.loadModel('model.glb');
} catch (error) {
  console.error('Failed to initialize:', error);
}
```

#### After (v2.0)
```typescript
const viewerRef = useRef<SimpleViewerHandle>(null);

// In component
<SimpleViewer 
  ref={viewerRef}
  {...options}
/>

// Handle errors via events
useEffect(() => {
  if (viewerRef.current) {
    const unsubscribe = viewerRef.current.events.on('error', ({ error }) => {
      console.error('Viewer error:', error.message, error.code);
    });
    
    return unsubscribe;
  }
}, []);
```

### 2. Update Model Loading

#### Before (v1.x)
```typescript
viewer.loadModel('model.glb')
  .then(model => console.log('Loaded:', model))
  .catch(error => console.error('Failed:', error));
```

#### After (v2.0)
```typescript
// Subscribe to model events
viewerRef.current.events.on('model:loading', ({ url }) => {
  console.log('Loading model:', url);
});

viewerRef.current.events.on('model:loaded', ({ model, loadTime }) => {
  console.log('Model loaded in', loadTime, 'ms');
});

viewerRef.current.events.on('model:error', ({ error, url }) => {
  console.error('Failed to load', url, ':', error.message);
});

// Load model
await viewerRef.current.loadModel('model.glb');
```

### 3. Update Configuration Options

#### Before (v1.x)
```typescript
const options = {
  backgroundColor: '#000000',
  antialias: true,
  shadowMap: true,
  cameraFov: 75,
  cameraPosition: [0, 5, 10],
  enableDamping: true,
  axes: true,
  grid: true
};
```

#### After (v2.0)
```typescript
const options: SimpleViewerOptions = {
  backgroundColor: '#000000',
  render: {
    antialias: true,
    shadowMap: true
  },
  camera: {
    cameraFov: 75,
    cameraPosition: [0, 5, 10]
  },
  controls: {
    enableDamping: true
  },
  helpers: {
    axes: true,
    grid: true
  }
};
```

### 4. Update Event Handling

#### Before (v1.x)
```typescript
// Custom event handling or callbacks
viewer.onLoad = (model) => { /* ... */ };
viewer.onError = (error) => { /* ... */ };
```

#### After (v2.0)
```typescript
// Type-safe event system
const events = viewerRef.current.events;

// Subscribe to events
events.on('initialized', ({ viewer }) => {
  console.log('Viewer initialized');
});

events.on('render:start', ({ frame }) => {
  console.log('Rendering frame:', frame);
});

events.on('controls:change', ({ type, camera }) => {
  console.log('Controls changed:', type);
});

// Unsubscribe
const unsubscribe = events.on('error', handler);
unsubscribe(); // Clean up
```

### 5. Handle Path Tracing Changes

#### Before (v1.x)
```typescript
const options = {
  usePathTracing: true,
  pathTracingSamples: 64
};
```

#### After (v2.0)
```typescript
const options: SimpleViewerOptions = {
  usePathTracing: true,
  pathTracing: {
    enabled: true,
    samples: 64,
    bounces: 4,
    renderScale: 1
  }
};

// Path tracing setup is now async
viewerRef.current.events.on('error', ({ error }) => {
  if (error.code === ErrorCode.RENDERER_INIT_FAILED) {
    console.warn('Path tracing setup failed, falling back to standard rendering');
  }
});
```

## API Reference

### SimpleViewerHandle
```typescript
interface SimpleViewerHandle {
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: OrbitControls | MapControls | null;
  events: TypedEventEmitter<ViewerEventMap>;  // New in v2.0
  
  loadModel(url: string): Promise<void>;
  captureScreenshot(): Promise<string>;
  startRendering(): void;
  stopRendering(): void;
  dispose(): void;
}
```

### ViewerEventMap
```typescript
interface ViewerEventMap {
  // Lifecycle events
  'initialized': { viewer: SimpleViewer };
  'disposed': { viewer: SimpleViewer };
  
  // Loading events
  'model:loading': { url: string };
  'model:loaded': { model: THREE.Object3D; loadTime: number };
  'model:error': { error: ThreeViewerError; url: string };
  
  // Rendering events
  'render:start': { frame: number };
  'render:complete': { frame: number; renderTime: number };
  'screenshot:captured': { dataUrl: string };
  
  // Interaction events
  'controls:change': { type: string; camera: THREE.Camera };
  'object:selected': { object: THREE.Object3D };
  
  // Error events
  'error': { error: ThreeViewerError };
}
```

### Error Codes
```typescript
enum ErrorCode {
  // Initialization errors
  SCENE_INIT_FAILED = 'SCENE_INIT_FAILED',
  RENDERER_INIT_FAILED = 'RENDERER_INIT_FAILED',
  CAMERA_INIT_FAILED = 'CAMERA_INIT_FAILED',
  
  // Loading errors
  MODEL_LOAD_FAILED = 'MODEL_LOAD_FAILED',
  TEXTURE_LOAD_FAILED = 'TEXTURE_LOAD_FAILED',
  
  // Runtime errors
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  WEBGL_NOT_SUPPORTED = 'WEBGL_NOT_SUPPORTED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  COMPONENT_NOT_MOUNTED = 'COMPONENT_NOT_MOUNTED'
}
```

## Common Migration Scenarios

### Scenario 1: Basic Viewer Setup
```typescript
// v1.x
const viewer = new SimpleViewer({
  backgroundColor: '#ffffff',
  antialias: true
});

// v2.0
<SimpleViewer 
  ref={viewerRef}
  backgroundColor="#ffffff"
  render={{ antialias: true }}
/>
```

### Scenario 2: Error Handling
```typescript
// v1.x
try {
  await viewer.loadModel('model.glb');
} catch (error) {
  alert('Failed to load model');
}

// v2.0
const [loadError, setLoadError] = useState<string | null>(null);

useEffect(() => {
  if (viewerRef.current) {
    return viewerRef.current.events.on('model:error', ({ error }) => {
      setLoadError(error.message);
    });
  }
}, []);
```

### Scenario 3: Custom Rendering Loop
```typescript
// v1.x
viewer.animationLoop = (time) => {
  // Custom animation logic
};

// v2.0
const options: SimpleViewerOptions = {
  animationLoop: (time) => {
    // Custom animation logic
  }
};
```

## Deprecation Warnings

The following features are deprecated and will be removed in v3.0:

1. **Direct property access** - Use configuration options instead
2. **Throwing errors** - All errors now use Result pattern
3. **Callback-based events** - Use the event system instead

## Troubleshooting

### Issue: "Cannot read property 'events' of null"
**Solution**: Ensure the viewer ref is initialized before accessing events:
```typescript
useEffect(() => {
  if (viewerRef.current?.events) {
    // Safe to use events
  }
}, []);
```

### Issue: "Invalid configuration" errors
**Solution**: Configuration is now validated. Check the error context for details:
```typescript
viewerRef.current.events.on('error', ({ error }) => {
  if (error.code === ErrorCode.INVALID_CONFIGURATION) {
    console.error('Invalid config:', error.context);
  }
});
```

### Issue: Path tracing not working
**Solution**: Path tracing setup is now async and may fail gracefully:
```typescript
viewerRef.current.events.on('initialized', ({ viewer }) => {
  // Check if path tracing was successfully initialized
  const sceneElements = viewer.getSceneElements();
  if (!sceneElements.pathTracingManager && options.usePathTracing) {
    console.warn('Path tracing requested but not available');
  }
});
```

## Getting Help

- **Documentation**: See the updated API docs
- **Examples**: Check the `/examples` directory for v2.0 patterns
- **Issues**: Report migration issues on GitHub
- **Support**: Join our Discord for migration help

## Version Compatibility

- **v1.x**: Supported until December 2024
- **v2.0**: Current stable version
- **v3.0**: Planned for Q2 2025 (will remove deprecated features)