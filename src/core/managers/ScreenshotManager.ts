import { IRenderer, ICamera, IControls } from '../interfaces';
import { SceneSerializer, SerializedSceneState } from '../utils/SceneSerializer';

export interface ScreenshotManagerDependencies {
  renderer: IRenderer;
  onRestore?: () => Promise<void>;
}

/**
 * Manages screenshot capture and restoration functionality
 */
export class ScreenshotManager {
  private screenshotElement: HTMLImageElement | null = null;
  private isShowingScreenshot: boolean = false;
  private screenshotResizeHandler?: () => void;
  private serializedSceneState?: SerializedSceneState;
  
  private readonly renderer: IRenderer;
  private readonly onRestore?: () => Promise<void>;

  constructor(dependencies: ScreenshotManagerDependencies) {
    this.renderer = dependencies.renderer;
    this.onRestore = dependencies.onRestore;
  }

  /**
   * Check if currently showing a screenshot
   */
  isActive(): boolean {
    return this.isShowingScreenshot;
  }

  /**
   * Capture current frame and replace canvas with screenshot
   */
  captureAndReplace(
    camera: ICamera,
    controls: IControls,
    lastModelUrl?: string,
    onResourcesDisposed?: () => void
  ): void {
    if (this.isShowingScreenshot) return;

    const canvas = this.renderer.getDomElement();

    // Capture the current frame as a data URL. If the drawing buffer was not
    // preserved this can come back empty ("data:,"); in that case keep the live
    // scene rather than replacing it with a blank image and disposing resources.
    const dataURL = canvas.toDataURL('image/png');
    if (!dataURL || dataURL === 'data:,') {
      console.warn('[ScreenshotManager] Screenshot capture produced no image, keeping live scene');
      return;
    }

    // Create an image element
    const img = document.createElement('img');
    img.src = dataURL;
    img.style.position = 'absolute';
    img.style.top = '0';
    img.style.left = '0';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.pointerEvents = 'auto';
    img.style.cursor = 'grab';
    
    // Insert the image in place of the canvas
    const parent = canvas.parentElement;
    if (parent) {
      // Serialize scene state before hiding canvas
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
      
      // Add interaction listeners to restore 3D scene
      const restoreScene = () => {
        this.restore();
      };
      
      img.addEventListener('mousedown', restoreScene);
      img.addEventListener('touchstart', restoreScene);
      
      // Also restore on window resize
      const resizeHandler = () => {
        if (this.isShowingScreenshot) {
          this.restore();
        }
      };
      window.addEventListener('resize', resizeHandler);
      this.screenshotResizeHandler = resizeHandler;
      
      // The capture was validated above, so it is safe to release scene resources.
      onResourcesDisposed?.();
    }
  }

  /**
   * Restore the 3D scene from screenshot
   */
  async restore(): Promise<void> {
    if (!this.isShowingScreenshot || !this.screenshotElement) return;
    
    const canvas = this.renderer.getDomElement();
    const parent = this.screenshotElement.parentElement;
    
    if (parent) {
      // Remove resize handler
      if (this.screenshotResizeHandler) {
        window.removeEventListener('resize', this.screenshotResizeHandler);
        this.screenshotResizeHandler = undefined;
      }
      
      // Remove screenshot and show canvas again
      parent.removeChild(this.screenshotElement);
      canvas.style.display = '';
      
      this.screenshotElement = null;
      this.isShowingScreenshot = false;
      
      // Call restore callback if provided
      if (this.onRestore) {
        await this.onRestore();
      }
    }
  }

  /**
   * Get serialized scene state for restoration
   */
  getSerializedState(): SerializedSceneState | undefined {
    return this.serializedSceneState;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.screenshotResizeHandler) {
      window.removeEventListener('resize', this.screenshotResizeHandler);
      this.screenshotResizeHandler = undefined;
    }
    
    if (this.screenshotElement && this.screenshotElement.parentElement) {
      this.screenshotElement.parentElement.removeChild(this.screenshotElement);
    }
    
    this.screenshotElement = null;
    this.isShowingScreenshot = false;
    this.serializedSceneState = undefined;
  }
}