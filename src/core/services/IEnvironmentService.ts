import { Result } from '../../utils/Result';
import { IScene } from '../interfaces/IScene';
import { ITexture } from '../interfaces/IScene';
import { IRenderer } from '../interfaces/IRenderer';

export interface IEnvironmentService {
  /**
   * Initialize the environment service
   */
  initialize(options: IEnvironmentOptions): Promise<Result<void>>;
  
  /**
   * Load environment map from URL
   */
  loadEnvironmentMap(url: string): Promise<Result<ITexture>>;
  
  /**
   * Apply environment to scene
   */
  applyToScene(scene: IScene, texture: ITexture): Result<void>;
  
  /**
   * Create studio environment
   */
  createStudioEnvironment(options?: IStudioEnvironmentOptions): Result<ITexture>;
  
  /**
   * Dispose of resources
   */
  dispose(): void;
}

export interface IEnvironmentOptions {
  renderer: IRenderer;
  autoDispose?: boolean;
}

export interface IStudioEnvironmentOptions {
  intensity?: number;
  groundColor?: string;
  skyColor?: string;
}