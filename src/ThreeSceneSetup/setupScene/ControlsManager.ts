import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MapControls } from 'three/examples/jsm/controls/MapControls';
import {ControlType, SimpleViewerOptions} from '../../types';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { Result } from '../../utils/Result';

export class ControlsManager {
  public controls: OrbitControls | MapControls | null = null;
  private camera: THREE.Camera;
  private rendererDomElement: HTMLCanvasElement;
  private options: SimpleViewerOptions;

  constructor(
    camera: THREE.Camera,
    rendererDomElement: HTMLCanvasElement,
    options: SimpleViewerOptions
  ) {
    this.camera = camera;
    this.rendererDomElement = rendererDomElement;
    this.options = options;
  }

  setup(): Result<OrbitControls | MapControls> {
    try {
      if (!this.camera) {
        return Result.err(
          new ThreeViewerError(
            'Cannot setup controls: Camera is not initialized',
            ErrorCode.CAMERA_INIT_FAILED,
            { manager: 'ControlsManager' }
          )
        );
      }

      if (!this.rendererDomElement) {
        return Result.err(
          new ThreeViewerError(
            'Cannot setup controls: Renderer DOM element is not available',
            ErrorCode.RENDERER_INIT_FAILED,
            { manager: 'ControlsManager' }
          )
        );
      }

      const controls =
        this.options.controls.type === ControlType.MapControls
          ? new MapControls(this.camera, this.rendererDomElement)
          : new OrbitControls(this.camera, this.rendererDomElement);

      // Apply control options
      const controlsConfig = this.options.controls;
      
      // Only apply properties that exist on the controls
      if (controlsConfig.enabled !== undefined) controls.enabled = controlsConfig.enabled;
      if (controlsConfig.enableDamping !== undefined) controls.enableDamping = controlsConfig.enableDamping;
      if (controlsConfig.dampingFactor !== undefined) controls.dampingFactor = controlsConfig.dampingFactor;
      if (controlsConfig.enableZoom !== undefined) controls.enableZoom = controlsConfig.enableZoom;
      if (controlsConfig.enableRotate !== undefined) controls.enableRotate = controlsConfig.enableRotate;
      if (controlsConfig.enablePan !== undefined) controls.enablePan = controlsConfig.enablePan;
      
      controls.update();
      this.controls = controls;

      return Result.ok(controls);
    } catch (error) {
      return Result.err(
        ThreeViewerError.fromError(
          error,
          ErrorCode.INVALID_CONFIGURATION,
          { 
            controlsType: this.options.controls.type,
            options: this.options.controls 
          }
        )
      );
    }
  }

  dispose(): void {
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
  }
}
