import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { ViewerRenderer } from '../rendering/ViewerRenderer';
import { canvasToPngDataUrl } from '../utils/canvasPng';
import { SceneSerializer, SerializedSceneState } from '../utils/SceneSerializer';

export interface ScreenshotManagerDependencies {
  renderer: ViewerRenderer;
  onRestore?: () => Promise<void>;
}

export class ScreenshotManager {
  private screenshotElement: HTMLImageElement | null = null;
  private isShowingScreenshot: boolean = false;
  private screenshotResizeHandler?: () => void;
  private serializedSceneState?: SerializedSceneState;

  private readonly renderer: ViewerRenderer;
  private readonly onRestore?: () => Promise<void>;

  constructor(dependencies: ScreenshotManagerDependencies) {
    this.renderer = dependencies.renderer;
    this.onRestore = dependencies.onRestore;
  }

  isActive(): boolean {
    return this.isShowingScreenshot;
  }

  captureAndReplace(
    camera: THREE.Camera,
    controls: OrbitControls,
    lastModelUrl?: string,
    onResourcesDisposed?: () => void
  ): void {
    if (this.isShowingScreenshot) return;

    const canvas = this.renderer.getDomElement();

    const dataURL = canvasToPngDataUrl(canvas);
    if (!dataURL) {
      console.warn('[ScreenshotManager] Screenshot capture produced no image, keeping live scene');
      return;
    }

    const img = document.createElement('img');
    img.src = dataURL;
    img.style.position = 'absolute';
    img.style.top = '0';
    img.style.left = '0';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.pointerEvents = 'auto';
    img.style.cursor = 'grab';

    const parent = canvas.parentElement;
    if (parent) {
      this.serializedSceneState = SceneSerializer.serialize(
        lastModelUrl,
        camera,
        controls,
        canvas
      );

      canvas.style.display = 'none';
      parent.appendChild(img);
      this.screenshotElement = img;
      this.isShowingScreenshot = true;

      const restoreScene = () => {
        this.restore();
      };

      img.addEventListener('mousedown', restoreScene);
      img.addEventListener('touchstart', restoreScene);

      const resizeHandler = () => {
        if (this.isShowingScreenshot) {
          this.restore();
        }
      };
      window.addEventListener('resize', resizeHandler);
      this.screenshotResizeHandler = resizeHandler;

      onResourcesDisposed?.();
    }
  }

  async restore(): Promise<void> {
    if (!this.isShowingScreenshot || !this.screenshotElement) return;

    const canvas = this.renderer.getDomElement();
    const parent = this.screenshotElement.parentElement;

    if (parent) {
      if (this.screenshotResizeHandler) {
        window.removeEventListener('resize', this.screenshotResizeHandler);
        this.screenshotResizeHandler = undefined;
      }

      parent.removeChild(this.screenshotElement);
      canvas.style.display = '';

      this.screenshotElement = null;
      this.isShowingScreenshot = false;

      if (this.onRestore) {
        await this.onRestore();
      }
    }
  }

  getSerializedState(): SerializedSceneState | undefined {
    return this.serializedSceneState;
  }

  dispose(): void {
    if (this.screenshotResizeHandler) {
      window.removeEventListener('resize', this.screenshotResizeHandler);
      this.screenshotResizeHandler = undefined;
    }

    if (this.screenshotElement && this.screenshotElement.parentElement) {
      this.screenshotElement.parentElement.removeChild(this.screenshotElement);
    }

    if (this.isShowingScreenshot) {
      this.renderer.getDomElement().style.display = '';
    }

    this.screenshotElement = null;
    this.isShowingScreenshot = false;
    this.serializedSceneState = undefined;
  }
}