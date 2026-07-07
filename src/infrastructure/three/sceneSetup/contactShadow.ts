import { ContactShadowMode } from '../../../core/services/ISceneSetupService';
import { IScene } from '../../../core/interfaces/IScene';
import { IObject3D } from '../../../core/interfaces/IObject3D';
import { IRenderer } from '../../../core/interfaces/IRenderer';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { toThreeObject, toThreeRenderer, toThreeScene } from '../unwrap';
import {
  ContactShadowBaker,
  CONTACT_SHADOW_BAKED_NAME,
  CONTACT_SHADOW_LIVE_NAME
} from '../ContactShadowBaker';
import { findDirectionalLight } from './findDirectionalLight';

export function bakeContactShadow(
  scene: IScene,
  object: IObject3D,
  renderer: IRenderer,
  baker: ContactShadowBaker
): Result<void> {
  try {
    const threeScene = toThreeScene(scene);
    if (!threeScene) {
      return Result.err(
        new ThreeViewerError(
          'Scene must be ThreeSceneAdapter',
          ErrorCode.INVALID_PARAMETER
        )
      );
    }

    const threeObject = toThreeObject(object);
    if (!threeObject) {
      return Result.err(
        new ThreeViewerError(
          'Object must expose a Three.js Object3D',
          ErrorCode.INVALID_PARAMETER
        )
      );
    }

    // No usable WebGL renderer (headless/SSR) or shadows disabled — the
    // live catcher, if any, stays in charge.
    const threeRenderer = toThreeRenderer(renderer.getInternalRenderer());
    if (!threeRenderer || !threeRenderer.shadowMap.enabled) {
      return Result.ok(undefined);
    }

    const directionalLight = findDirectionalLight(threeScene);
    if (!directionalLight || !directionalLight.castShadow) {
      return Result.ok(undefined);
    }

    baker.bake({
      renderer: threeRenderer,
      scene: threeScene,
      object: threeObject,
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

export function setContactShadowMode(scene: IScene, mode: ContactShadowMode): Result<void> {
  try {
    const threeScene = toThreeScene(scene);
    if (!threeScene) {
      return Result.err(
        new ThreeViewerError(
          'Scene must be ThreeSceneAdapter',
          ErrorCode.INVALID_PARAMETER
        )
      );
    }

    const baked = threeScene.getObjectByName(CONTACT_SHADOW_BAKED_NAME);
    const live = threeScene.getObjectByName(CONTACT_SHADOW_LIVE_NAME);

    // Without a baked shadow there is nothing to switch to — keep the live
    // catcher up rather than leaving the floor shadowless.
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
