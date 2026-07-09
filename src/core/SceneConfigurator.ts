import { IScene } from './interfaces';
import { ISceneSetupService, ILightingOptions, IHelperOptions } from './services/ISceneSetupService';
import { IEnvironmentService } from './services/IEnvironmentService';
import { IRenderer } from './interfaces/IRenderer';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';

const DARK_STUDIO_BACKGROUND = '#1a1a1f';

/**
 * Configures a scene's visual setup — helpers, lighting, background and the
 * environment map — from the viewer options. Pulled out of ViewerCore so the
 * viewer orchestrates lifecycle while this owns the (engine-agnostic) "how the
 * scene is dressed" concern. Operates only on core interfaces.
 */
export class SceneConfigurator {
  /**
   * Apply helpers, lighting and a solid-color gradient background. Synchronous;
   * failures are logged and skipped so one bad section never aborts setup.
   */
  configureScene(
    scene: IScene,
    sceneSetupService: ISceneSetupService,
    options: SimpleViewerOptions
  ): void {
    if (options.helpers) {
      const helperOptions: IHelperOptions = {
        grid: options.helpers.grid,
        axes: options.helpers.axes,
        gridColor: '#AAAAAA',
      };
      const helpersResult = sceneSetupService.addHelpers(scene, helperOptions);
      if (!helpersResult.ok) {
        console.warn('Failed to add helpers:', helpersResult.error);
      }
    }

    const lightingConfig = options.lighting;
    if (lightingConfig) {
      const lightingOptions: ILightingOptions = {
        ambient: lightingConfig.ambientLight ? {
          color: String(lightingConfig.ambientLight.color),
          intensity: lightingConfig.ambientLight.intensity
        } : undefined,
        hemisphere: lightingConfig.hemisphereLight ? {
          skyColor: String(lightingConfig.hemisphereLight.skyColor),
          groundColor: String(lightingConfig.hemisphereLight.groundColor),
          intensity: lightingConfig.hemisphereLight.intensity
        } : undefined,
        directional: lightingConfig.directionalLight ? {
          color: String(lightingConfig.directionalLight.color),
          intensity: lightingConfig.directionalLight.intensity,
          position: Array.isArray(lightingConfig.directionalLight.position)
            ? lightingConfig.directionalLight.position as [number, number, number]
            : undefined,
          castShadow: lightingConfig.directionalLight.castShadow,
          shadow: lightingConfig.directionalLight.shadow
        } : undefined,
      };
      const lightingResult = sceneSetupService.addLighting(scene, lightingOptions);
      if (!lightingResult.ok) {
        console.warn('Failed to add lighting:', lightingResult.error);
      }
    }

    // Set the background color unless something else owns the background: an
    // environment-map URL paints the image, and dark studio mode paints its own
    // dark scrim. The default (studio environment) lights the scene but keeps
    // this clean background color rather than showing its raw PMREM texture.
    const envUrl = options.environment?.url;
    const darkStudioOwnsBackground =
      (options.helpers?.studioEnvironment ?? false) && (options.helpers?.darkStudioMode ?? false);
    if (options.backgroundColor && !envUrl && !darkStudioOwnsBackground) {
      const color = String(options.backgroundColor);
      const edge = options.backgroundColorEdge;
      const gradient =
        edge !== undefined
          ? { topColor: color, bottomColor: String(edge), radial: true }
          : { topColor: color, bottomColor: color };
      const backgroundResult = sceneSetupService.createGradientBackground(scene, gradient);
      if (!backgroundResult.ok) {
        console.warn('Failed to set background:', backgroundResult.error);
      }
    }
  }

  /**
   * Initialize the environment service and apply an env map (from a URL or the
   * studio environment) to the scene. `isDisposed` is consulted after every
   * await so a teardown mid-setup (StrictMode unmount / structural rebuild)
   * aborts before touching a disposed renderer/scene.
   */
  async configureEnvironment(
    scene: IScene,
    environmentService: IEnvironmentService,
    sceneSetupService: ISceneSetupService | undefined,
    renderer: IRenderer,
    options: SimpleViewerOptions,
    isDisposed: () => boolean
  ): Promise<void> {
    const envInitResult = await environmentService.initialize({ renderer, autoDispose: true });
    if (isDisposed()) {
      return;
    }
    if (!envInitResult.ok) {
      console.warn('Failed to initialize environment service:', envInitResult.error);
    }

    const applyOptions = {
      backgroundBlurriness: options.environment?.backgroundBlurriness,
      backgroundIntensity: options.environment?.backgroundIntensity,
      environmentIntensity: options.environment?.environmentIntensity,
    };

    const envUrl = options.environment?.url;
    if (envUrl) {
      const envResult = await environmentService.loadEnvironmentMap(envUrl);
      if (isDisposed()) {
        return;
      }
      if (envResult.ok) {
        environmentService.applyToScene(scene, envResult.value, applyOptions);
      } else {
        console.warn('Failed to load environment map:', envResult.error);
      }
    } else if (options.helpers?.studioEnvironment) {
      const studioResult = environmentService.createStudioEnvironment();
      if (studioResult.ok) {
        // Studio environment supplies lighting/reflections only; the background
        // stays the clean color set in configureScene (its PMREM texture would
        // otherwise render as a washed-out sphere).
        environmentService.applyToScene(scene, studioResult.value, {
          ...applyOptions,
          setBackground: false,
        });

        if (options.helpers?.darkStudioMode && sceneSetupService) {
          const backgroundResult = sceneSetupService.createGradientBackground(scene, {
            topColor: DARK_STUDIO_BACKGROUND,
            bottomColor: DARK_STUDIO_BACKGROUND,
          });
          if (!backgroundResult.ok) {
            console.warn('Failed to set dark studio background:', backgroundResult.error);
          }
        }
      } else {
        console.warn('Failed to create studio environment:', studioResult.error);
      }
    }
  }
}
