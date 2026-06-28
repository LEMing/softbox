// Common type definitions to replace any types

import * as THREE from 'three';

// Controls type that can be OrbitControls or MapControls
export type ControlsInstance = {
  enabled: boolean;
  update(): void;
  dispose(): void;
  target: THREE.Vector3;
  getThreeControls?(): unknown;
};

// Renderer extension
export type RendererWithInternalAccess = {
  getInternalRenderer?: () => THREE.WebGLRenderer;
  renderer?: THREE.WebGLRenderer;
  getThreeRenderer?: () => THREE.WebGLRenderer;
  getDomElement?: () => HTMLCanvasElement & {
    getContext?: (type: string) => WebGLRenderingContext & {
      canvas?: {
        parentElement?: {
          renderer?: THREE.WebGLRenderer;
        };
      };
    };
  };
};