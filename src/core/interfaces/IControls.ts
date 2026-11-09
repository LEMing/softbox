import { IVector3 } from './IObject3D';

export interface IControls {
  enabled: boolean;
  
  enableDamping: boolean;
  dampingFactor: number;
  enableZoom: boolean;
  enableRotate: boolean;
  enablePan: boolean;
  
  zoomSpeed: number;
  minDistance: number;
  maxDistance: number;
  
  rotateSpeed: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minAzimuthAngle: number;
  maxAzimuthAngle: number;

  autoRotate: boolean;
  autoRotateSpeed: number;
  
  panSpeed: number;
  screenSpacePanning: boolean;
  
  target: IVector3;
  
  update(): boolean;
  reset(): void;
  dispose(): void;

  onChange(listener: () => void): () => void;
  
  connect(domElement: HTMLElement): void;
  disconnect(): void;
}

export interface IOrbitControls extends IControls {
  type: 'orbit';
}

export interface IMapControls extends IControls {
  type: 'map';
  screenSpacePanning: true;
}