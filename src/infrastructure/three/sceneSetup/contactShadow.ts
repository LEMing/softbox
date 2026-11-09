import type * as THREE from 'three';
import { ContactShadowMode } from '../../../core/services/ISceneSetupService';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import {
  ContactShadowBaker,
  CONTACT_SHADOW_BAKED_NAME,
  CONTACT_SHADOW_LIVE_NAME,
  restoreLiveContactShadow
} from '../ContactShadowBaker';
import { findDirectionalLight } from './findDirectionalLight';

export function bakeContactShadow(
  scene: THREE.Scene,
  object: THREE.Object3D,
  renderer: THREE.WebGLRenderer | null,
  baker: ContactShadowBaker
): Result<void> {
  try {
    if (!renderer || !renderer.shadowMap.enabled) {
      return Result.ok(undefined);
    }

    const directionalLight = findDirectionalLight(scene);
    if (!directionalLight || !directionalLight.castShadow) {
      return Result.ok(undefined);
    }

    baker.bake({
      renderer,
      scene,
      object,
      light: directionalLight,
    });

    return Result.ok(undefined);
  } catch (error) {
    return Result.err(
      new ThreeViewerError(
        'Failed to bake contact shadow',
        ErrorCode.SCENE_OPERATION_FAILED,
        { originalError: error }
      )
    );
  }
}

export function resetContactShadow(scene: THREE.Scene): Result<void> {
  try {
    restoreLiveContactShadow(scene);
    return Result.ok(undefined);
  } catch (error) {
    return Result.err(
      new ThreeViewerError(
        'Failed to reset the contact shadow',
        ErrorCode.SCENE_OPERATION_FAILED,
        { originalError: error }
      )
    );
  }
}

export function setContactShadowMode(scene: THREE.Scene, mode: ContactShadowMode): Result<void> {
  try {
    const baked = scene.getObjectByName(CONTACT_SHADOW_BAKED_NAME);
    const live = scene.getObjectByName(CONTACT_SHADOW_LIVE_NAME);

    if (mode === 'baked' && !baked) {
      return Result.ok(undefined);
    }

    if (baked) {
      baked.visible = mode === 'baked';
    }
    if (live) {
      live.visible = mode === 'live';
    }

    return Result.ok(undefined);
  } catch (error) {
    return Result.err(
      new ThreeViewerError(
        'Failed to switch contact shadow mode',
        ErrorCode.SCENE_OPERATION_FAILED,
        { originalError: error }
      )
    );
  }
}
