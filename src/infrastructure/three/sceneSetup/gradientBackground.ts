import * as THREE from 'three';
import { markViewerOwnedBackground, disposeViewerOwnedBackground } from '../backgroundOwnership';
import { IGradientOptions } from '../../../core/services/ISceneSetupService';
import { IScene } from '../../../core/interfaces/IScene';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { toThreeScene } from '../unwrap';

export function createGradientBackground(scene: IScene, options: IGradientOptions): Result<void> {
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


    // A radial vignette needs a square canvas (a 2px-wide strip would smear the
    // circle horizontally); the plain vertical gradient only varies down one
    // column, so a 2px strip is enough and cheaper.
    const canvas = document.createElement('canvas');
    canvas.width = options.radial ? 512 : 2;
    canvas.height = 512;

    const context = canvas.getContext('2d');
    if (!context) {
      return Result.err(
        new ThreeViewerError(
          'Failed to create canvas context',
          ErrorCode.SCENE_OPERATION_FAILED
        )
      );
    }

    const gradient = options.radial
      ? // Centre sits slightly ABOVE the middle (y=205 of 512 ≈ 40% down) so the
        // bright lift lands behind the subject, and the outer radius reaches the
        // corners/bottom so they fall off to the dark edge — a studio vignette.
        context.createRadialGradient(256, 205, 0, 256, 256, 380)
      : context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, options.topColor);
    gradient.addColorStop(1, options.bottomColor);

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    markViewerOwnedBackground(texture);

    // Repeated repaints must not leak the previous canvas — but ONLY
    // viewer-painted backgrounds are ours to dispose; an env-map backdrop is
    // the cached original the texture cache and path tracer still hold.
    disposeViewerOwnedBackground(threeScene);
    threeScene.background = texture;

    return Result.ok(undefined);
  } catch (error) {
    return Result.err(
      new ThreeViewerError(
        'Failed to create gradient background',
        ErrorCode.SCENE_OPERATION_FAILED,
        { originalError: error, options }
      )
    );
  }
}
