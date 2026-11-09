import { IScene } from './interfaces';
import { ISceneSetupService, ILightingOptions, IHelperOptions } from './services/ISceneSetupService';
import { IEnvironmentService } from './services/IEnvironmentService';
import { IRenderer } from './interfaces/IRenderer';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { Vec3Like } from './interfaces/Vec3Like';
import { environmentApplyOptions } from './environmentApplyOptions';

const DARK_STUDIO_BACKGROUND = '#1a1a1f';

const toPositionArray = (
  position: Vec3Like | [number, number, number] | undefined
): [number, number, number] | undefined => {
  if (Array.isArray(position)) {
    return position;
  }
  if (position && typeof position === 'object') {
    return [position.x, position.y, position.z];
  }
  return undefined;
};

const toColor = (color: string | number | undefined): string | undefined =>
  color !== undefined ? String(color) : undefined;

export class SceneConfigurator {
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
          color: toColor(lightingConfig.directionalLight.color),
          intensity: lightingConfig.directionalLight.intensity,
          position: toPositionArray(lightingConfig.directionalLight.position),
          castShadow: lightingConfig.directionalLight.castShadow,
          shadow: lightingConfig.directionalLight.shadow
        } : undefined,
        fill: lightingConfig.fillLight ? {
          color: toColor(lightingConfig.fillLight.color),
          intensity: lightingConfig.fillLight.intensity,
          position: toPositionArray(lightingConfig.fillLight.position),
        } : undefined,
        rim: lightingConfig.rimLight ? {
          color: toColor(lightingConfig.rimLight.color),
          intensity: lightingConfig.rimLight.intensity,
          position: toPositionArray(lightingConfig.rimLight.position),
        } : undefined,
      };
      const lightingResult = sceneSetupService.addLighting(scene, lightingOptions);
      if (!lightingResult.ok) {
        console.warn('Failed to add lighting:', lightingResult.error);
      }
    }

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

    const applyOptions = environmentApplyOptions(options);

    const envUrl = options.environment?.url;
    if (envUrl) {
      const envResult = await environmentService.loadEnvironmentMap(envUrl);
      if (isDisposed()) {
        return;
      }
      if (envResult.ok) {
        const applied = environmentService.applyToScene(scene, envResult.value, applyOptions);
        if (!applied.ok) {
          console.warn('Failed to apply environment map:', applied.error);
        }
        return;
      }
      console.warn(
        'Failed to load environment map, falling back to the studio look:',
        envResult.error
      );
      if (options.helpers?.studioEnvironment !== false) {
        this.applyStudioEnvironment(scene, environmentService, sceneSetupService, options, applyOptions);
      }
      this.paintFallbackBackdrop(scene, sceneSetupService, options);
      return;
    }
    if (options.helpers?.studioEnvironment) {
      this.applyStudioEnvironment(scene, environmentService, sceneSetupService, options, applyOptions);
    }
  }

  private paintFallbackBackdrop(
    scene: IScene,
    sceneSetupService: ISceneSetupService | undefined,
    options: SimpleViewerOptions
  ): void {
    if (!sceneSetupService || options.backgroundColor === undefined) {
      return;
    }
    const color = String(options.backgroundColor);
    const edge = options.backgroundColorEdge;
    const gradient =
      edge !== undefined
        ? { topColor: color, bottomColor: String(edge), radial: true }
        : { topColor: color, bottomColor: color };
    const backgroundResult = sceneSetupService.createGradientBackground(scene, gradient);
    if (!backgroundResult.ok) {
      console.warn('Failed to paint the fallback backdrop:', backgroundResult.error);
    }
  }

  private applyStudioEnvironment(
    scene: IScene,
    environmentService: IEnvironmentService,
    sceneSetupService: ISceneSetupService | undefined,
    options: SimpleViewerOptions,
    applyOptions: { backgroundBlurriness?: number; backgroundIntensity?: number; environmentIntensity?: number }
  ): void {
    const studioResult = environmentService.createStudioEnvironment(
      options.environment?.studioLook
    );
    if (!studioResult.ok) {
      console.warn('Failed to create studio environment:', studioResult.error);
      return;
    }
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
  }
}
