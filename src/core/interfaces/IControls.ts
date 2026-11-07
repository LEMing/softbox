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

  // Turntable: orbit the camera around the target each update(); pauses
  // automatically while the user interacts.
  autoRotate: boolean;
  autoRotateSpeed: number;
  
  // Pan settings
  panSpeed: number;
  screenSpacePanning: boolean;
  
  // Target
  target: IVector3;
  
  // Methods
  update(): boolean;
  reset(): void;
  dispose(): void;

  /**
   * Subscribe to camera changes driven by the controls themselves (user
   * input, damping, autoRotate). This is what wakes a wound-down render
   * loop: the controls mutate the camera directly, so once the loop has
   * stopped (idle static scene, converged path tracing) nothing else
   * observes the interaction. Returns an unsubscribe function.
   */
  onChange(listener: () => void): () => void;
  
  // Event handling
  connect(domElement: HTMLElement): void;
  disconnect(): void;
}

export interface IOrbitControls extends IControls {
  type: 'orbit';
}

export interface IMapControls extends IControls {
  type: 'map';
  screenSpacePanning: true; // Always true for map controls
}