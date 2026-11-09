import type * as THREE from 'three';
import { Result } from '../../utils/Result';

export interface IModelLoader {
  load(url: string, onProgress?: (loaded: number, total: number) => void): Promise<Result<IModel>>;
  
  supports(url: string): boolean;

  dispose?(): void;
}

export interface IModel {
  scene: THREE.Object3D;
  userData?: Record<string, unknown>;
}

export const MODEL_VARIANT_NAMES_KEY = 'softboxVariants';
