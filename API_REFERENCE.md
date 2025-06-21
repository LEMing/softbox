# ThreeDViewer API Reference v2.0

## Table of Contents
- [Components](#components)
- [Configuration Options](#configuration-options)
- [Event System](#event-system)
- [Error Handling](#error-handling)
- [Utility Functions](#utility-functions)
- [Types and Interfaces](#types-and-interfaces)

## Components

### SimpleViewer

The main component for rendering 3D scenes.

```typescript
import { SimpleViewer, SimpleViewerHandle } from 'threedviewer';

const viewerRef = useRef<SimpleViewerHandle>(null);

<SimpleViewer
  ref={viewerRef}
  object={modelUrl}
  {...options}
/>
```

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `object` | `string \| THREE.Object3D \| null` | Model URL or Three.js object to display |
| `options` | `SimpleViewerOptions` | Configuration options (see below) |

#### Ref Handle (SimpleViewerHandle)

```typescript
interface SimpleViewerHandle {
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: OrbitControls | MapControls | null;
  events: TypedEventEmitter<ViewerEventMap>;
  
  // Methods
  loadModel(url: string): Promise<void>;
  captureScreenshot(): Promise<string>;
  startRendering(): void;
  stopRendering(): void;
  dispose(): void;
}
```

## Configuration Options

### SimpleViewerOptions

The main configuration interface has been modularized for better organization:

```typescript
interface SimpleViewerOptions {
  backgroundColor?: string | number;
  staticScene?: boolean;
  render?: RenderOptions;
  camera?: CameraOptions;
  controls?: ControlOptions;
  helpers?: HelperOptions;
  pathTracing?: PathTracingOptions;
  environment?: EnvironmentOptions;
  loading?: LoadingOptions;
  animationLoop?: (time: number) => void;
}
```

### RenderOptions

```typescript
interface RenderOptions {
  antialias?: boolean;              // Enable antialiasing (default: true)
  alpha?: boolean;                  // Enable alpha channel (default: false)
  shadowMap?: boolean;              // Enable shadow mapping (default: true)
  toneMapping?: THREE.ToneMapping;  // Tone mapping type (default: ACESFilmicToneMapping)
  toneMappingExposure?: number;     // Exposure level (default: 1)
  outputColorSpace?: THREE.ColorSpace; // Output color space (default: SRGBColorSpace)
}
```

### CameraOptions

```typescript
interface CameraOptions {
  type?: 'perspective' | 'orthographic'; // Camera type (default: 'perspective')
  fov?: number;                          // Field of view (1-180, default: 75)
  near?: number;                         // Near clipping plane (default: 0.1)
  far?: number;                          // Far clipping plane (default: 1000)
  position?: [number, number, number];   // Initial position (default: [3, 3, 3])
  lookAt?: [number, number, number];     // Look at point (default: [0, 0, 0])
  autoFitToObject?: boolean;             // Auto-fit camera to loaded object
}
```

### ControlOptions

```typescript
interface ControlOptions {
  type?: 'orbit' | 'map';        // Control type (default: 'orbit')
  enabled?: boolean;              // Enable controls (default: true)
  enableDamping?: boolean;        // Enable damping/inertia (default: true)
  dampingFactor?: number;         // Damping factor (0-1, default: 0.05)
  enableZoom?: boolean;           // Enable zoom (default: true)
  enableRotate?: boolean;         // Enable rotation (default: true)
  enablePan?: boolean;            // Enable panning (default: true)
  autoRotate?: boolean;           // Enable auto-rotation (default: false)
  autoRotateSpeed?: number;       // Auto-rotation speed (default: 2)
  minDistance?: number;           // Minimum zoom distance
  maxDistance?: number;           // Maximum zoom distance
}
```

### HelperOptions

```typescript
interface HelperOptions {
  axes?: boolean | number;              // Show axes helper (boolean or size)
  grid?: boolean | GridHelperOptions;   // Show grid helper
  stats?: boolean;                      // Show performance stats
  gizmo?: boolean | GizmoOptions;       // Show viewport gizmo
  object3DHelper?: boolean;             // Show object bounding boxes
  studioEnvironment?: boolean;          // Use studio lighting setup
}

interface GridHelperOptions {
  size?: number;        // Grid size (default: 10)
  divisions?: number;   // Grid divisions (default: 10)
  color1?: string;      // Primary color (default: '#444444')
  color2?: string;      // Secondary color (default: '#888888')
}
```

### PathTracingOptions

```typescript
interface PathTracingOptions {
  enabled: boolean;        // Enable path tracing
  samples?: number;        // Samples per pixel (default: 64)
  bounces?: number;        // Light bounces (default: 4)
  renderScale?: number;    // Render scale (0-1, default: 1)
  tiles?: [number, number]; // Tile size for progressive rendering
}
```

## Event System

### TypedEventEmitter

The event system provides type-safe event handling:

```typescript
const viewerRef = useRef<SimpleViewerHandle>(null);

// Subscribe to events
useEffect(() => {
  if (!viewerRef.current) return;
  
  const unsubscribe = viewerRef.current.events.on('model:loaded', ({ model, loadTime }) => {
    console.log(`Model loaded in ${loadTime}ms`);
  });
  
  return unsubscribe; // Cleanup
}, []);
```

### ViewerEventMap

All available events:

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

### Event Methods

```typescript
// Subscribe to event
const unsubscribe = events.on('event:name', handler);

// Subscribe once
const unsubscribe = events.once('event:name', handler);

// Emit event (internal use)
events.emit('event:name', data);

// Unsubscribe
unsubscribe();
```

## Error Handling

### ThreeViewerError

Custom error class with context:

```typescript
class ThreeViewerError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public context?: Record<string, any>
  );
  
  static fromError(
    error: unknown,
    code: ErrorCode,
    context?: Record<string, any>
  ): ThreeViewerError;
}
```

### ErrorCode

Error code enumeration:

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
  COMPONENT_NOT_MOUNTED = 'COMPONENT_NOT_MOUNTED',
  UNKNOWN = 'UNKNOWN'
}
```

### Result Type

Functional error handling pattern:

```typescript
type Result<T, E = ThreeViewerError> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

// Usage
const result = manager.setup();
if (!result.ok) {
  console.error(result.error);
  return;
}
// Use result.value
```

## Utility Functions

### OptionsValidator

Validates configuration options:

```typescript
import { OptionsValidator } from 'threedviewer/validation';

const result = OptionsValidator.validate(options);
if (!result.ok) {
  console.error('Invalid options:', result.error.context?.errors);
}
```

### deprecationWarning

Handles deprecation notices:

```typescript
import { deprecationWarning } from 'threedviewer/utils';

deprecationWarning(
  'oldFeature',
  'newFeature',
  'v3.0' // Version when removed
);
```

## Types and Interfaces

### Core Types

```typescript
// Three.js re-exports
export type { THREE } from 'three';
export type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
export type { MapControls } from 'three/examples/jsm/controls/MapControls';

// Viewer types
export type ModelInput = string | THREE.Object3D | null;
export type LoaderGLB = GLTFLoader & { parse: Function };
```

### Manager Interfaces

All managers follow the Result pattern:

```typescript
interface Manager {
  setup(): Result<T>;
  dispose(): void;
}

// Example: CameraManager
class CameraManager {
  setup(options: CameraOptions): Result<THREE.Camera>;
  updateAspect(aspect: number): void;
  dispose(): void;
}
```

## Examples

### Basic Usage

```typescript
import { SimpleViewer } from 'threedviewer';
import { useRef, useEffect } from 'react';

function MyViewer() {
  const viewerRef = useRef<SimpleViewerHandle>(null);
  
  useEffect(() => {
    if (!viewerRef.current) return;
    
    // Load a model
    viewerRef.current.loadModel('/models/example.glb');
    
    // Subscribe to events
    const unsubscribe = viewerRef.current.events.on('model:loaded', ({ model }) => {
      console.log('Model loaded:', model);
    });
    
    return unsubscribe;
  }, []);
  
  return (
    <SimpleViewer
      ref={viewerRef}
      backgroundColor="#1a1a1a"
      render={{ antialias: true }}
      camera={{ fov: 60 }}
    />
  );
}
```

### Error Handling

```typescript
function MyViewer() {
  const viewerRef = useRef<SimpleViewerHandle>(null);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!viewerRef.current) return;
    
    const unsubscribe = viewerRef.current.events.on('error', ({ error }) => {
      setError(`Error ${error.code}: ${error.message}`);
    });
    
    return unsubscribe;
  }, []);
  
  return (
    <>
      {error && <div className="error">{error}</div>}
      <SimpleViewer ref={viewerRef} />
    </>
  );
}
```

### Path Tracing

```typescript
<SimpleViewer
  ref={viewerRef}
  usePathTracing={true}
  pathTracing={{
    enabled: true,
    samples: 128,
    bounces: 6,
    renderScale: 0.5 // Start at half resolution
  }}
/>
```

### Custom Animation Loop

```typescript
<SimpleViewer
  ref={viewerRef}
  animationLoop={(time) => {
    if (viewerRef.current?.scene) {
      // Rotate all meshes
      viewerRef.current.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.rotation.y = time * 0.001;
        }
      });
    }
  }}
/>
```

## Best Practices

1. **Always handle errors** - Subscribe to error events
2. **Clean up subscriptions** - Return unsubscribe functions in useEffect
3. **Check refs before use** - Ensure viewerRef.current exists
4. **Validate options** - Use OptionsValidator for runtime validation
5. **Use type imports** - Import types for better tree-shaking

## Migration from v1.x

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for detailed migration instructions.