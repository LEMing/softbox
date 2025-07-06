import { IVector3 } from './IObject3D';

/**
 * Core interface for camera controls, independent of implementation
 */
export interface IControls {
  enabled: boolean;
  
  // Common control settings
  enableDamping: boolean;
  dampingFactor: number;
  enableZoom: boolean;
  enableRotate: boolean;
  enablePan: boolean;
  
  // Zoom settings
  zoomSpeed: number;
  minDistance: number;
  maxDistance: number;
  
  // Rotation settings
  rotateSpeed: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minAzimuthAngle: number;
  maxAzimuthAngle: number;
  
  // Pan settings
  panSpeed: number;
  screenSpacePanning: boolean;
  
  // Target
  target: IVector3;
  
  // Methods
  update(): boolean;
  reset(): void;
  dispose(): void;
  
  // Event handling
  connect(domElement: HTMLElement): void;
  disconnect(): void;
}

export interface IOrbitControls extends IControls {
  type: 'orbit';
  autoRotate: boolean;
  autoRotateSpeed: number;
}

export interface IMapControls extends IControls {
  type: 'map';
  screenSpacePanning: true; // Always true for map controls
}

export type ControlsType = IOrbitControls | IMapControls;