
# ThreeDViewer

ThreeDViewer is a React component library for easily integrating Three.js-based 3D viewers into your web applications. It provides a simple and customizable way to display and interact with 3D objects in your React projects.

![ThreeDGizmo Preview](https://github.com/LEMing/ThreeDViewer/raw/main/src/assets/cover-raytracing.png)
![ThreeDGizmo Preview](https://github.com/LEMing/ThreeDViewer/raw/main/src/assets/cover-dark.png)

## Features

- Easy integration with React applications
- Customizable viewer settings
- Support for various 3D object formats
- Built-in camera and map controls
- Optional gizmo controller
- Responsive design
- Ability to handle external scenes and Three.js objects
- Path tracing for high-quality rendering with customizable parameters
- Environment map support for realistic lighting and reflections
- Screenshot capture when rendering is complete (optional)
- Event-driven architecture with typed events
- Comprehensive error handling with a `Result` pattern
- Modular, fully-typed option interfaces

## Installation

To install ThreeDViewer, run the following command in your project directory:

```bash
npm install threedviewer
```

or if you're using yarn:

```bash
yarn add threedviewer
```

> **Note:** Version 3.0.0 introduces breaking changes (packaging is now ESM + CJS, the imperative handle and option types changed). See the [CHANGELOG](./CHANGELOG.md) for the full list.

## Usage

Here's a super simple example of how to use the `SimpleViewer` component in your React application:
You just need to pass a url model and use it as a regular jsx component.

```jsx
import React from 'react';
import { SimpleViewer } from 'threedviewer';

function App() {
   return (
      <div style={{ width: '100%', height: '400px' }}>
        <SimpleViewer object={'https://modelviewer.dev/shared-assets/models/RobotExpressive.glb'} />
      </div>
   );
}

export default App;

```


Here's a basic example of how to use the `SimpleViewer` component:

```jsx
import React from 'react';
import { SimpleViewer } from 'threedviewer';
import * as THREE from 'three';

function App() {
   // Create a simple cube
   const geometry = new THREE.BoxGeometry(1, 1, 1);
   const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
   const cube = new THREE.Mesh(geometry, material);

   return (
      <div style={{ width: '100%', height: '400px' }}>
        <SimpleViewer object={cube} />
      </div>
   );
}

export default App;
```

## Advanced Usage

Customize the viewer through the `options` prop and access the live Three.js objects via the imperative handle (`ref`):

```tsx
import React, { useEffect, useMemo, useRef } from 'react';
import {
  SimpleViewer,
  defaultOptions,
  type SimpleViewerOptions,
  type SimpleViewerHandle,
} from 'threedviewer';

function App() {
  const viewerRef = useRef<SimpleViewerHandle>(null);

  const options: SimpleViewerOptions = useMemo(() => ({
    ...defaultOptions,
    staticScene: false,
    backgroundColor: '#000000',
    camera: {
      ...defaultOptions.camera,
      position: [72, 72, 72],
      target: [0, 0, 0],
      fov: 60,
      autoFitToObject: false,
    },
    lighting: {
      ...defaultOptions.lighting,
      ambientLight: { color: '#404040', intensity: 0.5 },
      directionalLight: { color: '#ffffff', intensity: Math.PI, position: [10, 10, 5] },
    },
    helpers: {
      ...defaultOptions.helpers,
      axes: true,
      gizmo: true, // Enable the viewport gizmo
    },
  }), []);

  useEffect(() => {
    const handle = viewerRef.current;
    if (!handle) return;
    // The live Three.js objects are available on the handle:
    // handle.scene, handle.camera, handle.renderer, handle.controls
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <SimpleViewer
        ref={viewerRef}
        object="https://modelviewer.dev/shared-assets/models/RobotExpressive.glb"
        options={options}
      />
    </div>
  );
}

export default App;
```

The imperative handle exposes `scene`, `camera`, `renderer`, `controls`, `events`, `loadModel(source)` and `dispose()`.

## API

### SimpleViewer

The main component for displaying 3D objects.

Props:
- `object` (required): A Three.js `Object3D` to be displayed in the viewer, or a URL string to a 3D model file.
- `options` (optional): An object containing viewer options (see below).

### Event System

The SimpleViewer provides an event-driven API through the `events` property on the viewer handle:

```tsx
import React, { useRef, useEffect } from 'react';
import { SimpleViewer, type SimpleViewerHandle } from 'threedviewer';

function App() {
  const viewerRef = useRef<SimpleViewerHandle>(null);

  useEffect(() => {
    if (!viewerRef.current) return;

    const { events } = viewerRef.current;

    // Subscribe to events
    events.on('model:loaded', ({ model, loadTime }) => {
      console.log('Model loaded in', loadTime, 'ms');
    });

    events.on('render:complete', ({ frame, renderTime }) => {
      console.log('Frame', frame, 'rendered in', renderTime, 'ms');
    });

    events.on('error', ({ error }) => {
      console.error('Viewer error:', error);
    });

    // Cleanup
    return () => {
      events.removeAllListeners();
    };
  }, []);

  return (
    <SimpleViewer
      ref={viewerRef}
      object="https://modelviewer.dev/shared-assets/models/RobotExpressive.glb"
    />
  );
}
```

Available events:
- `model:loaded` - Fired when a model is successfully loaded
- `model:error` - Fired when model loading fails
- `render:complete` - Fired after each render frame
- `controls:change` - Fired when camera controls are updated
- `error` - General error event

## Configuration Options

`SimpleViewer` accepts an `options` prop for customization. Here's an overview of available options:

```ts
import { ControlType } from 'threedviewer';

const defaultOptions: SimpleViewerOptions = {
  staticScene: false, // stop the animation loop when there are no interactions
  backgroundColor: '#f0f0f7',
  replaceWithScreenshotOnComplete: true, // replace the canvas with a still once path tracing finishes
  animationLoop: null,

  pathTracing: {
    enabled: false,
    maxSamples: 16, // sample cap before path tracing is considered complete
    bounces: 16,
    transmissiveBounces: 4,
    renderScale: 0.8,
    lowResScale: 0.25,
    dynamicLowRes: true,
  },

  camera: {
    position: [60, 60, 60],
    target: [0, 0, 0],
    fov: 45,
    near: 0.1,
    far: 100000,
    autoFitToObject: true,
  },

  environment: {
    url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/industrial_sunset_puresky.jpg',
    backgroundBlurriness: 0.15,
    backgroundIntensity: 1,
    environmentIntensity: 1,
  },

  lighting: {
    ambientLight: { color: '#404040', intensity: Math.PI },
    hemisphereLight: { skyColor: '#ffffbb', groundColor: '#080820', intensity: 1 },
    directionalLight: {
      color: '#ffffff',
      intensity: Math.PI,
      position: [72, 72, 72],
      castShadow: true,
      shadow: {
        mapSize: { width: 4096, height: 4096 },
        camera: { near: 0.5, far: 200, left: -50, right: 50, top: 50, bottom: -50 },
        bias: -0.0001,
        radius: 1,
      },
    },
  },

  renderer: {
    antialias: true,
    alpha: false,
    shadowMapEnabled: true,
    pixelRatio: window.devicePixelRatio,
    shadowMapType: 2, // THREE.PCFSoftShadowMap
    toneMapping: 6, // THREE.ACESFilmicToneMapping
    toneMappingExposure: 1.5,
  },

  controls: {
    type: ControlType.OrbitControls, // OrbitControls or MapControls
    enabled: true,
    enableDamping: true,
    dampingFactor: 0.25,
    enableZoom: true,
    enableRotate: true,
    enablePan: true,
  },

  helpers: {
    grid: { type: 'hexagonal_wire', size: 20, divisions: 20, colorGrid: 0x444444, opacity: 0.5 },
    axes: false,
    stats: false,
    gizmo: false, // viewport gizmo is disabled by default
    studioEnvironment: true, // studio lighting environment (set environment.url to override)
    darkStudioMode: false,
  },
};
```

### Viewport Gizmo

ThreeDViewer includes an optional viewport gizmo for easy camera orientation control:

```javascript
const options = {
  helpers: {
    gizmo: true, // Enable with default settings
    // Or configure with options:
    gizmo: {
      placement: 'top-right', // 'top-left', 'top-right', 'bottom-left', 'bottom-right'
      size: 128 // Size in pixels
    }
  }
};
```

The gizmo provides:
- Interactive 3D orientation indicator
- Click to snap camera to axis views
- Visual feedback for current camera orientation
- Synchronized with main viewport controls

### Path Tracing

ThreeDViewer supports path tracing for high-quality rendering with customizable settings via the `pathTracing` option:

- `enabled`: Enables the path tracing mode.
- `maxSamples`: Caps the number of accumulated samples (path tracing completes once reached).
- `bounces`: Number of light bounces.
- `transmissiveBounces`: Number of transmissive bounces.
- `lowResScale`: Low-resolution scale factor for performance optimization.
- `renderScale`: Controls the overall rendering scale.
- `dynamicLowRes`: Adjusts resolution dynamically based on performance.

### Environment Map

To improve lighting and reflections, ThreeDViewer supports environment maps:

- `environment.url`: You can provide a URL to an environment map. For example:
  ```ts
  environment: {
    url: 'https://cdn.polyhaven.com/asset_img/primary/sunset_in_the_chalk_quarry.png',
  }
  ```

This will automatically load and apply the environment map to the scene. To use a built-in studio environment instead of a URL, set `helpers.studioEnvironment: true` (and optionally `helpers.darkStudioMode: true`).

### Experimental: Replace Viewer with Screenshot

If `replaceWithScreenshotOnComplete` is set to `true`, the viewer will be replaced with a static image once path tracing completes.
