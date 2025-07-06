// Common type definitions to replace any types

import * as THREE from 'three';

// Generic event data type
export type EventData = Record<string, unknown>;

// GLTF load callback type
export type GLTFLoadCallback = (gltf: { scene: THREE.Object3D }) => void;

// Controls type that can be OrbitControls or MapControls
export type ControlsInstance = {
  enabled: boolean;
  update(): void;
  dispose(): void;
  target: THREE.Vector3;
  getThreeControls?(): unknown;
};

// Three.js camera types
export type ThreeCameraWithFOV = THREE.Camera & {
  fov?: number;
  aspect?: number;
  near?: number;
  far?: number;
};

// Position type
export type Position3D = {
  x: number;
  y: number;
  z: number;
} | [number, number, number];

// Grid child type
export type GridChild = THREE.Object3D & {
  isHexGrid?: boolean;
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

// Camera options type  
export type CameraOptionsLegacy = {
  fov?: number;
  cameraFov?: number;
  near?: number;
  cameraNear?: number;
  far?: number;
  cameraFar?: number;
  position?: Position3D;
  cameraPosition?: Position3D;
};

// Object with Three.js access
export type ObjectWithThreeAccess = {
  getThreeObject?: () => THREE.Object3D;
};

// Camera with Three.js access
export type CameraWithThreeAccess = {
  getThreeCamera?: () => THREE.Camera;
};

// Controls with Three.js access
export type ControlsWithThreeAccess = {
  getThreeControls?: () => unknown;
};