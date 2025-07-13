import React, { forwardRef } from 'react';
import * as THREE from 'three';
import { SimpleViewerProps } from './types';
import { SimpleViewer } from './presentation/components/SimpleViewer';
import { ControlsInstance } from './types/CommonTypes';
import { TypedEventEmitter } from './events/EventEmitter';
import { ViewerEventMap } from './events/ViewerEvents';

// Define SimpleViewerHandle interface here since SimpleViewer.tsx is removed
export interface SimpleViewerHandle {
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: ControlsInstance | null;
  events: TypedEventEmitter<ViewerEventMap>;
  loadModel?: (url: string) => Promise<void>;
  startRendering?: () => void;
  stopRendering?: () => void;
  captureScreenshot?: () => Promise<string>;
  dispose?: () => void;
}

/**
 * SimpleViewer component using clean architecture
 * This is now the main export replacing the legacy implementation
 */
const SimpleViewerWrapper = forwardRef<SimpleViewerHandle, SimpleViewerProps>(
  (props, ref) => {
    return <SimpleViewer ref={ref} {...props} />;
  }
);

SimpleViewerWrapper.displayName = 'SimpleViewer';

export default SimpleViewerWrapper;
