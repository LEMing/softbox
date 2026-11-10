import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {
  ISceneSetupService,
  IHelperOptions,
  ILightingOptions,
  IGradientOptions,
  ContactShadowMode
} from '../../core/services/ISceneSetupService';
import { Result } from '../../utils/Result';
import { ContactShadowBaker } from './ContactShadowBaker';
import { applyMaterialVariant, whenMaterialVariantsResolved } from './gltf/materialVariants';
import {
  addDynamicGrid,
  addHelpers,
  addLighting,
  bakeContactShadow,
  resetContactShadow,
  createGradientBackground,
  fitCameraToObject,
  fitShadowCameraToObject,
  setContactShadowMode,
  snapObjectToFloor,
  wrapInUnitsScaleGroup
} from './sceneSetup';

export class ThreeSceneSetupService implements ISceneSetupService {
  private readonly contactShadowBaker = new ContactShadowBaker();

  addHelpers(scene: THREE.Scene, options: IHelperOptions): Result<void> {
    return addHelpers(scene, options);
  }

  addDynamicGrid(scene: THREE.Scene, object: THREE.Object3D, scaleFactor: number = 1.2): Result<void> {
    return addDynamicGrid(scene, object, scaleFactor);
  }

  snapObjectToFloor(scene: THREE.Scene, object: THREE.Object3D): Result<void> {
    return snapObjectToFloor(scene, object);
  }

  fitShadowCameraToObject(scene: THREE.Scene, object: THREE.Object3D): Result<void> {
    return fitShadowCameraToObject(scene, object);
  }

  bakeContactShadow(scene: THREE.Scene, object: THREE.Object3D, renderer: THREE.WebGLRenderer | null): Result<void> {
    return bakeContactShadow(scene, object, renderer, this.contactShadowBaker);
  }

  resetContactShadow(scene: THREE.Scene): Result<void> {
    return resetContactShadow(scene);
  }

  setContactShadowMode(scene: THREE.Scene, mode: ContactShadowMode): Result<void> {
    return setContactShadowMode(scene, mode);
  }

  wrapInUnitsScaleGroup(object: THREE.Object3D, scaleToMeters: number): Result<THREE.Object3D> {
    return wrapInUnitsScaleGroup(object, scaleToMeters);
  }

  async applyMaterialVariant(model: THREE.Object3D, variant: string | null): Promise<Result<boolean>> {
    await whenMaterialVariantsResolved(model);
    return Result.ok(applyMaterialVariant(model, variant));
  }

  addLighting(scene: THREE.Scene, options: ILightingOptions): Result<void> {
    return addLighting(scene, options);
  }

  createGradientBackground(scene: THREE.Scene, options: IGradientOptions): Result<void> {
    return createGradientBackground(scene, options);
  }

  fitCameraToObject(object: THREE.Object3D, camera: THREE.PerspectiveCamera, controls: OrbitControls): Result<void> {
    return fitCameraToObject(object, camera, controls);
  }
}
