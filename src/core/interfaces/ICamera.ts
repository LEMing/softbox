import { IObject3D, IVector3 } from './IObject3D';
import { IRendererExtension } from './IRendererExtension';

/**
 * Core interface for cameras, independent of rendering engine
 */
export interface ICamera extends IObject3D, IRendererExtension {
  type: 'perspective' | 'orthographic';
  
  // Common camera properties
  near: number;
  far: number;
  
  // View matrix
  lookAt(target: IVector3): void;
  updateProjectionMatrix(): void;
  
  // Camera helpers
  getWorldDirection(target: IVector3): void;
}

export interface IPerspectiveCamera extends ICamera {
  type: 'perspective';
  fov: number;
  aspect: number;
}

export interface IOrthographicCamera extends ICamera {
  type: 'orthographic';
  left: number;
  right: number;
  top: number;
  bottom: number;
  zoom: number;
}

export type CameraType = IPerspectiveCamera | IOrthographicCamera;