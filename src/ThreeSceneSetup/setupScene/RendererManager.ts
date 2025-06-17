import * as THREE from 'three';
import {SimpleViewerOptions} from '../../types';
import {initializeRenderer} from './initializeRenderer';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { Result } from '../../utils/Result';

export class RendererManager {
  public renderer: THREE.WebGLRenderer | null = null;
  private options: SimpleViewerOptions;

  constructor(options: SimpleViewerOptions) {
    this.options = options;
  }

  setup(): Result<THREE.WebGLRenderer> {
    try {
      // Check WebGL support
      if (!this.isWebGLSupported()) {
        return Result.err(
          new ThreeViewerError(
            'WebGL is not supported in this browser',
            ErrorCode.WEBGL_NOT_SUPPORTED,
            { userAgent: navigator.userAgent }
          )
        );
      }

      this.renderer = initializeRenderer(this.options.renderer);
      
      if (!this.renderer) {
        return Result.err(
          new ThreeViewerError(
            'Failed to initialize renderer',
            ErrorCode.RENDERER_INIT_FAILED,
            { options: this.options.renderer }
          )
        );
      }

      return Result.ok(this.renderer);
    } catch (error) {
      return Result.err(
        ThreeViewerError.fromError(
          error,
          ErrorCode.RENDERER_INIT_FAILED,
          { options: this.options.renderer }
        )
      );
    }
  }

  private isWebGLSupported(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
    } catch (e) {
      return false;
    }
  }

  dispose(): void {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}
