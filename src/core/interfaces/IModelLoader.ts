import { Result } from '../../utils/Result';
import { IObject3D } from './IObject3D';

/**
 * Core interface for model loaders, independent of file format
 */
export interface IModelLoader {
  /**
   * Load a 3D model from a URL. `onProgress` reports download progress in
   * bytes; loaders only call it when the transport reports a total size.
   */
  load(url: string, onProgress?: (loaded: number, total: number) => void): Promise<Result<IModel>>;
  
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

/**
 * `IModel.userData` key carrying the model's KHR_materials_variants names.
 * Namespaced: loaders copy the glTF root `extras` into userData verbatim, so a
 * plain `variants` key could be shadowed by authored metadata that has nothing
 * to do with colorways.
 */
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