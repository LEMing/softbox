import type * as THREE from 'three';
import { Result } from '../../utils/Result';
import { StudioLook } from '../../types/options';

export interface IEnvironmentService {
  initialize(options: IEnvironmentOptions): Promise<Result<void>>;
  
  loadEnvironmentMap(url: string): Promise<Result<THREE.Texture>>;
  
  applyToScene(scene: THREE.Scene, texture: THREE.Texture, options?: IEnvironmentApplyOptions): Result<void>;
  
  createStudioEnvironment(look?: StudioLook): Result<THREE.Texture>;

  setBackgroundImage(scene: THREE.Scene, source: string | File | HTMLImageElement): Promise<Result<void>>;

  removeGroundProjection(scene: THREE.Scene): void;

  dispose(): void;
}

export interface IEnvironmentOptions {
  renderer: THREE.WebGLRenderer | null;
  autoDispose?: boolean;
}

export interface IEnvironmentApplyOptions {
  backgroundBlurriness?: number;
  backgroundIntensity?: number;
  environmentIntensity?: number;
  setBackground?: boolean;
  groundProjection?: { height: number; radius: number };
}