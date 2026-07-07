import * as THREE from 'three';
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


    // Create gradient shader
    const canvas = document.createElement('canvas');
    canvas.width = 2;
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

    // Create gradient
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, options.topColor);
    gradient.addColorStop(1, options.bottomColor);

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Apply as background, disposing any previous background texture so that
    // repeated calls (e.g. runtime background-color changes) do not leak.
    // Guard against disposing a texture that is still in use as the scene
    // environment (studio mode shares one PMREM texture for both).
    const previous = threeScene.background;
    if (previous instanceof THREE.Texture && previous !== threeScene.environment) {
      previous.dispose();
    }
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
