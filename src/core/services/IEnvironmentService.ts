import { Result } from '../../utils/Result';
import { IScene } from '../interfaces/IScene';
import { ITexture } from '../interfaces/IScene';
import { IRenderer } from '../interfaces/IRenderer';
import { StudioLook } from '../../types/options';

export interface IEnvironmentService {
  initialize(options: IEnvironmentOptions): Promise<Result<void>>;
  
  loadEnvironmentMap(url: string): Promise<Result<ITexture>>;
  
  applyToScene(scene: IScene, texture: ITexture, options?: IEnvironmentApplyOptions): Result<void>;
  
  createStudioEnvironment(look?: StudioLook): Result<ITexture>;

  setBackgroundImage(scene: IScene, source: string | File | HTMLImageElement): Promise<Result<void>>;

  removeGroundProjection(scene: IScene): void;

  dispose(): void;
}

export interface IEnvironmentOptions {
  renderer: IRenderer;
  autoDispose?: boolean;
}

export interface IEnvironmentApplyOptions {
  backgroundBlurriness?: number;
  backgroundIntensity?: number;
  environmentIntensity?: number;
  setBackground?: boolean;
  groundProjection?: { height: number; radius: number };
}