import {
  ISceneSetupService,
  IHelperOptions,
  ILightingOptions,
  IGradientOptions,
  ContactShadowMode
} from '../../core/services/ISceneSetupService';
import { IScene } from '../../core/interfaces/IScene';
import { IObject3D } from '../../core/interfaces/IObject3D';
import { ICamera } from '../../core/interfaces/ICamera';
import { IControls } from '../../core/interfaces/IControls';
import { IRenderer } from '../../core/interfaces/IRenderer';
import { Result } from '../../utils/Result';
import { ContactShadowBaker } from './ContactShadowBaker';
import {
  addDynamicGrid,
  addHelpers,
  addLighting,
  bakeContactShadow,
  createGradientBackground,
  fitCameraToObject,
  fitShadowCameraToObject,
  setContactShadowMode,
  snapObjectToFloor,
  wrapInUnitsScaleGroup
} from './sceneSetup';

/**
 * Facade over the scene-setup concerns: each operation lives in its own
 * module under ./sceneSetup; this class only routes the ISceneSetupService
 * port to them and owns the one stateful collaborator, the service-lifetime
 * ContactShadowBaker every bake goes through.
 */
export class ThreeSceneSetupService implements ISceneSetupService {
  private readonly contactShadowBaker = new ContactShadowBaker();

  addHelpers(scene: IScene, options: IHelperOptions): Result<void> {
    return addHelpers(scene, options);
  }

  addDynamicGrid(scene: IScene, object: IObject3D, scaleFactor: number = 1.2): Result<void> {
    return addDynamicGrid(scene, object, scaleFactor);
  }

  snapObjectToFloor(scene: IScene, object: IObject3D): Result<void> {
    return snapObjectToFloor(scene, object);
  }

  fitShadowCameraToObject(scene: IScene, object: IObject3D): Result<void> {
    return fitShadowCameraToObject(scene, object);
  }

  bakeContactShadow(scene: IScene, object: IObject3D, renderer: IRenderer): Result<void> {
    return bakeContactShadow(scene, object, renderer, this.contactShadowBaker);
  }

  setContactShadowMode(scene: IScene, mode: ContactShadowMode): Result<void> {
    return setContactShadowMode(scene, mode);
  }

  wrapInUnitsScaleGroup(object: IObject3D, scaleToMeters: number): Result<IObject3D> {
    return wrapInUnitsScaleGroup(object, scaleToMeters);
  }

  addLighting(scene: IScene, options: ILightingOptions): Result<void> {
    return addLighting(scene, options);
  }

  createGradientBackground(scene: IScene, options: IGradientOptions): Result<void> {
    return createGradientBackground(scene, options);
  }

  fitCameraToObject(object: IObject3D, camera: ICamera, controls: IControls): Result<void> {
    return fitCameraToObject(object, camera, controls);
  }
}
