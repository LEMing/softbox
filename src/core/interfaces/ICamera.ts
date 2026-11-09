import { IObject3D, IVector3 } from './IObject3D';
import { IRendererExtension } from './IRendererExtension';

export interface ICamera extends IObject3D, IRendererExtension {
  type: 'perspective' | 'orthographic';
  
  near: number;
  far: number;
  
  lookAt(target: IVector3): void;
  updateProjectionMatrix(): void;
  
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