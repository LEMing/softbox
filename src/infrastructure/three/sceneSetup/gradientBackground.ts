import * as THREE from 'three';
import { markViewerOwnedBackground, disposeViewerOwnedBackground } from '../backgroundOwnership';
import { IGradientOptions } from '../../../core/services/ISceneSetupService';
import { IScene } from '../../../core/interfaces/IScene';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { toThreeScene } from '../unwrap';

const GRADIENT_CANVAS_HEIGHT = 512;
const VERTICAL_STRIP_WIDTH = 2;
const VIGNETTE_CENTER_X = 256;
const VIGNETTE_CENTER_Y_BEHIND_SUBJECT = 205;
const VIGNETTE_OUTER_CENTER_Y = 256;
const VIGNETTE_RADIUS_REACHING_CORNERS = 380;

function canvasWidthFor(options: IGradientOptions): number {
  if (options.radial) {
    return GRADIENT_CANVAS_HEIGHT;
  }

  return VERTICAL_STRIP_WIDTH;
}

function createStudioVignette(context: CanvasRenderingContext2D): CanvasGradient {
  return context.createRadialGradient(
    VIGNETTE_CENTER_X,
    VIGNETTE_CENTER_Y_BEHIND_SUBJECT,
    0,
    VIGNETTE_CENTER_X,
    VIGNETTE_OUTER_CENTER_Y,
    VIGNETTE_RADIUS_REACHING_CORNERS
  );
}

function createVerticalGradient(context: CanvasRenderingContext2D, height: number): CanvasGradient {
  return context.createLinearGradient(0, 0, 0, height);
}

function createGradient(context: CanvasRenderingContext2D, options: IGradientOptions, height: number): CanvasGradient {
  if (options.radial) {
    return createStudioVignette(context);
  }

  return createVerticalGradient(context, height);
}

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

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidthFor(options);
    canvas.height = GRADIENT_CANVAS_HEIGHT;

    const context = canvas.getContext('2d');
    if (!context) {
      return Result.err(
        new ThreeViewerError(
          'Failed to create canvas context',
          ErrorCode.SCENE_OPERATION_FAILED
        )
      );
    }

    const gradient = createGradient(context, options, canvas.height);
    gradient.addColorStop(0, options.topColor);
    gradient.addColorStop(1, options.bottomColor);

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    markViewerOwnedBackground(texture);

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
