import { Result } from '../../utils/Result';
import { IObject3D } from './IObject3D';

/**
 * Core interface for model loaders, independent of file format
 */
export interface IModelLoader {
  /**
   * Load a 3D model from a URL
   */
  load(url: string): Promise<Result<IModel>>;
  
  /**
   * Check if this loader supports the given URL/file type
   */
  supports(url: string): boolean;

  /**
   * Release any resources the loader holds (e.g. decoder worker pools).
   * Optional: loaders without external resources may omit it.
   */
  dispose?(): void;
}

export interface IModel {
  scene: IObject3D;
  animations?: IAnimation[];
  cameras?: IModelCamera[];
  userData?: Record<string, unknown>;
}

export interface IAnimation {
  name: string;
  duration: number;
  tracks: IAnimationTrack[];
}

export interface IAnimationTrack {
  name: string;
  type: 'vector' | 'quaternion' | 'number' | 'boolean';
  times: Float32Array;
  values: Float32Array;
}

export interface IModelCamera {
  name: string;
  type: string;
  fov?: number;
  aspect?: number;
  near: number;
  far: number;
}