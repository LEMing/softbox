# Breaking Changes in ThreeDViewer v2.0

This document lists all breaking changes from v1.x to v2.0. For migration instructions, see [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md).

## Table of Contents
- [Error Handling](#error-handling)
- [API Changes](#api-changes)
- [Configuration Structure](#configuration-structure)
- [Event System](#event-system)
- [Manager Initialization](#manager-initialization)
- [TypeScript Types](#typescript-types)

## Error Handling

### Manager Methods Now Return Result<T>

**v1.x:**
```typescript
const camera = cameraManager.setup(options); // throws on error
```

**v2.0:**
```typescript
const result = cameraManager.setup(options);
if (!result.ok) {
  console.error(result.error);
  return;
}
const camera = result.value;
```

### No More Throwing Errors

All managers use the Result pattern instead of throwing errors. This affects:
- `CameraManager.setup()`
- `RendererManager.setup()`
- `ControlsManager.setup()`
- `SceneInitializer.setup()`
- `PathTracingManager.setup()`
- `AnimationManager.setup()`
- `EnvironmentMapManager.setup()` and `load()`

## API Changes

### SimpleViewerHandle Interface

**v1.x:**
```typescript
interface SimpleViewerHandle {
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: OrbitControls | MapControls | null;
}
```

**v2.0:**
```typescript
interface SimpleViewerHandle {
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: OrbitControls | MapControls | null;
  events: TypedEventEmitter<ViewerEventMap>; // NEW
}
```

### Model Loading

**v1.x:**
```typescript
viewer.loadModel(url)
  .then(model => { /* ... */ })
  .catch(error => { /* ... */ });
```

**v2.0:**
```typescript
// Use events instead
viewer.events.on('model:loaded', ({ model, loadTime }) => { /* ... */ });
viewer.events.on('model:error', ({ error, url }) => { /* ... */ });
await viewer.loadModel(url);
```

## Configuration Structure

### Flat to Nested Structure

**v1.x:**
```typescript
{
  backgroundColor: '#000000',
  antialias: true,
  shadowMap: true,
  cameraFov: 75,
  enableDamping: true,
  axes: true
}
```

**v2.0:**
```typescript
{
  backgroundColor: '#000000',
  render: {
    antialias: true,
    shadowMap: true
  },
  camera: {
    fov: 75
  },
  controls: {
    enableDamping: true
  },
  helpers: {
    axes: true
  }
}
```

### Path Tracing Configuration

**v1.x:**
```typescript
{
  usePathTracing: true,
  pathTracingSamples: 64
}
```

**v2.0:**
```typescript
{
  usePathTracing: true,
  pathTracing: {
    enabled: true,
    samples: 64,
    bounces: 4,
    renderScale: 1
  }
}
```

## Event System

### Callback-based to Event Emitter

**v1.x:**
```typescript
viewer.onLoad = (model) => { /* ... */ };
viewer.onError = (error) => { /* ... */ };
viewer.onRender = () => { /* ... */ };
```

**v2.0:**
```typescript
viewer.events.on('model:loaded', ({ model, loadTime }) => { /* ... */ });
viewer.events.on('error', ({ error }) => { /* ... */ });
viewer.events.on('render:complete', ({ frame, renderTime }) => { /* ... */ });
```

### Event Names

Old callback properties are replaced with events:
- `onLoad` → `model:loaded`
- `onError` → `error`
- `onRender` → `render:complete`
- `onControlsChange` → `controls:change`

## Manager Initialization

### Async Path Tracing Setup

**v1.x:**
```typescript
const pathTracingManager = new PathTracingManager(/*...*/);
// Setup was synchronous
```

**v2.0:**
```typescript
const pathTracingManager = new PathTracingManager(/*...*/);
const result = pathTracingManager.setup();
if (!result.ok) {
  // Handle error - path tracing may not be available
}
```

### Environment Map Loading

**v1.x:**
```typescript
// Loaded automatically in constructor
const envManager = new EnvironmentMapManager(options);
```

**v2.0:**
```typescript
const envManager = new EnvironmentMapManager(options);
const setupResult = envManager.setup();
if (setupResult.ok) {
  const loadResult = await envManager.load();
  if (!loadResult.ok) {
    // Handle load error
  }
}
```

## TypeScript Types

### Removed Types
- `LoaderGLB` - Use `GLTFLoader` directly
- Old `SimpleViewerOptions` interface - Use modular options

### Changed Types
- `ControlType` enum moved to `types/options`
- `HelperOptions` interface restructured
- Error types now use `ThreeViewerError` class

### New Types
- `Result<T, E>` - For error handling
- `ViewerEventMap` - For event types
- `ErrorCode` enum - For error categorization
- Modular option interfaces (`RenderOptions`, `CameraOptions`, etc.)

## Component Props

### Deprecated Props
These props show deprecation warnings in v2.0 and will be removed in v3.0:
- `antialias` - Use `render.antialias`
- `shadowMap` - Use `render.shadowMap`
- `cameraFov` - Use `camera.fov`
- `cameraPosition` - Use `camera.position`
- `enableDamping` - Use `controls.enableDamping`
- `axes` - Use `helpers.axes`
- `grid` - Use `helpers.grid`

## Validation

### New Configuration Validation
v2.0 validates all configuration options and emits errors for invalid values:

```typescript
// This will emit an error event
<SimpleViewer camera={{ fov: 200 }} /> // FOV must be 1-180
```

## Error Context

### Enhanced Error Information
All errors now include context:

**v1.x:**
```typescript
throw new Error('Failed to load model');
```

**v2.0:**
```typescript
new ThreeViewerError(
  'Failed to load model',
  ErrorCode.MODEL_LOAD_FAILED,
  { url, originalError, loadTime }
)
```

## Removal Timeline

### Deprecated in v2.0, Removed in v3.0:
1. Flat configuration props
2. Callback-based events
3. Throwing errors from managers
4. Direct property access on viewer
5. Old type definitions

### Migration Period
- v2.0: Deprecation warnings shown
- v2.x: Both old and new APIs work
- v3.0: Old APIs removed

## Getting Help

If you encounter issues during migration:
1. Check [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
2. See [examples/v2-patterns](./examples/v2-patterns) for new patterns
3. File an issue on GitHub with the `migration` label
4. Join our Discord for community support