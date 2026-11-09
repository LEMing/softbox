import { Result } from '../../utils/Result';
import { IObject3D } from './IObject3D';

export interface IModelLoader {
  load(url: string, onProgress?: (loaded: number, total: number) => void): Promise<Result<IModel>>;
  
  supports(url: string): boolean;

  dispose?(): void;
}

export interface IModel {
  scene: IObject3D;
  animations?: IAnimation[];
  cameras?: IModelCamera[];
  userData?: Record<string, unknown>;
}

export const MODEL_VARIANT_NAMES_KEY = 'softboxVariants';

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