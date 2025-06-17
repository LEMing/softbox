import * as THREE from 'three';
import {SimpleViewerOptions} from '../../types';
import { ThreeViewerError, ErrorCode } from '../../errors';
import {importRaytracer} from '../importRaytracer';
import {initializeCamera} from './initializeCamera';

const DEFAULT_F_STOP = 1.4; // Aperture setting for depth of field effect

export class CameraManager {
  private mountRef: React.RefObject<HTMLDivElement>;
  private options: SimpleViewerOptions;
  public camera: THREE.Camera;

  constructor(mountRef: React.RefObject<HTMLDivElement>, options: SimpleViewerOptions) {
    this.mountRef = mountRef;
    this.options = options;
    this.camera = this.setupCamera();
  }

  private setupCamera(): THREE.Camera {
    if (!this.mountRef.current) {
      throw new ThreeViewerError(
        'Cannot create camera: Mount element is not ready',
        ErrorCode.COMPONENT_NOT_MOUNTED,
        { manager: 'CameraManager', method: 'setupCamera' }
      );
    }

    const width = this.mountRef.current.clientWidth;
    const height = this.mountRef.current.clientHeight;

    if (width <= 0 || height <= 0) {
      throw new ThreeViewerError(
        'Invalid mount dimensions',
        ErrorCode.INVALID_CONFIGURATION,
        { width, height }
      );
    }

    const aspectRatio = width / height;
    let camera: THREE.Camera;

    try {
      if (this.options.usePathTracing) {
        const {PhysicalCamera} = importRaytracer();
        camera = new PhysicalCamera(
          this.options.camera.cameraFov,
          aspectRatio,
          this.options.camera.cameraNear,
          this.options.camera.cameraFar
        );
        // PhysicalCamera supports fStop property
        if ('fStop' in camera) {
          (camera as { fStop: number }).fStop = DEFAULT_F_STOP;
        }
      } else {
        camera = new THREE.PerspectiveCamera(
          this.options.camera.cameraFov,
          aspectRatio,
          this.options.camera.cameraNear,
          this.options.camera.cameraFar
        );
      }

      initializeCamera(camera, this.options.camera);
      return camera;
    } catch (error) {
      throw ThreeViewerError.fromError(
        error,
        ErrorCode.CAMERA_INIT_FAILED,
        { usePathTracing: this.options.usePathTracing }
      );
    }
  }
}