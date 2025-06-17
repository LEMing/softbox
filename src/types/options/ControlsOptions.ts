export enum ControlType {
  MapControls = 'MapControls',
  OrbitControls = 'OrbitControls'
}

export interface ControlsOptions {
  type?: ControlType;
  enabled?: boolean;
  enableDamping?: boolean;
  dampingFactor?: number;
  enableZoom?: boolean;
  enableRotate?: boolean;
  enablePan?: boolean;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  minDistance?: number;
  maxDistance?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
}