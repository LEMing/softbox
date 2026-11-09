import type * as THREE from 'three';
import type { ViewerRenderer } from './rendering/ViewerRenderer';
import { bestEffort } from '../utils/bestEffort';
import { applyCameraAspect } from './utils/cameraAspect';
import { PathTracingCoordinator } from './PathTracingCoordinator';
import { FrameLoop } from './FrameLoop';

export interface ViewportResizerDependencies {
  renderer: ViewerRenderer;
  camera: THREE.PerspectiveCamera;
  pathTracing: PathTracingCoordinator;
  frameLoop: FrameLoop;
  isDisposed: () => boolean;
}

const ASPECT_TOLERANCE = 1e-6;

export class ViewportResizer {
  private readonly deps: ViewportResizerDependencies;

  constructor(deps: ViewportResizerDependencies) {
    this.deps = deps;
  }

  resize(width: number, height: number): void {
    if (this.deps.isDisposed()) {
      return;
    }
    const targetAspect = width / height;
    const sizeMatches = this.canvasMatches(width, height);
    const aspectMatches = Math.abs(this.deps.camera.aspect - targetAspect) < ASPECT_TOLERANCE;
    if (sizeMatches && aspectMatches) {
      return;
    }

    applyCameraAspect(this.deps.camera, targetAspect);
    if (!sizeMatches) {
      this.deps.renderer.setSize(width, height);
    }

    bestEffort(() => this.deps.frameLoop.renderRaster());

    this.deps.pathTracing.resetAccumulation();
    this.deps.frameLoop.repaint();
  }

  private canvasMatches(width: number, height: number): boolean {
    const canvas = this.deps.renderer.getDomElement();
    const pixelRatio = this.deps.renderer.getPixelRatio();
    return (
      canvas.width === Math.floor(width * pixelRatio) &&
      canvas.height === Math.floor(height * pixelRatio)
    );
  }
}
