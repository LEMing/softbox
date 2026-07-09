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
  applyToScene(scene: IScene, texture: ITexture, options?: IEnvironmentApplyOptions): Result<void>;
  
  /**
   * Create studio environment
   */
  createStudioEnvironment(options?: IStudioEnvironmentOptions): Result<ITexture>;

  /**
   * Set the scene background to a plain LDR image (URL, File, or HTMLImageElement)
   * without changing scene.environment.
   */
  setBackgroundImage(scene: IScene, source: string | File | HTMLImageElement): Promise<Result<void>>;

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

export interface IEnvironmentApplyOptions {
  backgroundBlurriness?: number;
  backgroundIntensity?: number;
  environmentIntensity?: number;
  /**
   * Also paint the environment map as the scene background. Default `true`.
   * Set `false` to light/reflect from the map while keeping a separate
   * background (e.g. the studio environment, which supplies lighting but should
   * not put its raw PMREM texture on screen).
   */
  setBackground?: boolean;
}