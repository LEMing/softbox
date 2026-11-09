import * as THREE from 'three';

export type ControlsInstance = {
  enabled: boolean;
  update(): void;
  dispose(): void;
  target: THREE.Vector3;
  getThreeControls?(): unknown;
};

export type RendererWithInternalAccess = {
  renderer?: THREE.WebGLRenderer;
  getThreeRenderer?: () => THREE.WebGLRenderer;
};