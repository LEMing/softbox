// SceneInitializer.ts
import * as THREE from 'three';
import {MapControls} from 'three/examples/jsm/controls/MapControls';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls';
import {SimpleViewerOptions} from '../types';
import {addHelpers} from './addHelpers';
import {addLighting} from './addLighting';
import {createGradientBackground} from './createGradientBackground';
import {fitCameraToObject} from './fitCameraToObject';
import {initializeScene} from './initializeScene';
import { ThreeViewerError, ErrorCode } from '../errors';
import { Result } from '../utils/Result';

export class SceneInitializer {
  public scene: THREE.Scene | null = null;
  private object: THREE.Object3D | null;
  private camera: THREE.Camera;
  private controls: OrbitControls | MapControls;
  private options: SimpleViewerOptions;
  private mountRef: React.RefObject<HTMLDivElement>;

  constructor(
    object: THREE.Object3D | null,
    camera: THREE.Camera,
    controls: OrbitControls | MapControls,
    options: SimpleViewerOptions,
    mountRef: React.RefObject<HTMLDivElement>
  ) {
    this.object = object;
    this.camera = camera;
    this.controls = controls;
    this.options = options;
    this.mountRef = mountRef;
  }

  setup(): Result<THREE.Scene> {
    try {
      // Validate mount ref
      if (!this.mountRef.current) {
        return Result.err(
          new ThreeViewerError(
            'Cannot initialize scene: Mount element is not ready',
            ErrorCode.COMPONENT_NOT_MOUNTED,
            { manager: 'SceneInitializer' }
          )
        );
      }

      // Validate required dependencies
      if (!this.camera) {
        return Result.err(
          new ThreeViewerError(
            'Cannot initialize scene: Camera is not provided',
            ErrorCode.CAMERA_INIT_FAILED,
            { manager: 'SceneInitializer' }
          )
        );
      }

      if (!this.controls) {
        return Result.err(
          new ThreeViewerError(
            'Cannot initialize scene: Controls are not provided',
            ErrorCode.INVALID_CONFIGURATION,
            { manager: 'SceneInitializer' }
          )
        );
      }

      // Initialize scene
      this.scene = initializeScene(this.options);
      
      if (!this.scene) {
        return Result.err(
          new ThreeViewerError(
            'Failed to initialize Three.js scene',
            ErrorCode.SCENE_INIT_FAILED,
            { options: this.options }
          )
        );
      }

      // Setup scene components
      const setupResult = this.setupScene();
      if (!setupResult.ok) {
        return setupResult;
      }

      return Result.ok(this.scene);
    } catch (error) {
      return Result.err(
        ThreeViewerError.fromError(
          error,
          ErrorCode.SCENE_INIT_FAILED,
          { 
            options: this.options,
            hasObject: !!this.object 
          }
        )
      );
    }
  }

  private setupScene(): Result<void> {
    try {
      if (!this.mountRef.current) {
        return Result.err(
          new ThreeViewerError(
            'Mount element became unavailable during scene setup',
            ErrorCode.COMPONENT_NOT_MOUNTED
          )
        );
      }

      const width = this.mountRef.current.clientWidth;
      const height = this.mountRef.current.clientHeight;
      
      if (width <= 0 || height <= 0) {
        return Result.err(
          new ThreeViewerError(
            'Invalid mount element dimensions',
            ErrorCode.INVALID_CONFIGURATION,
            { width, height }
          )
        );
      }

      const size = new THREE.Vector2(width * 3, height * 3);

      if (this.options.helpers.studioEnvironment) {
        createGradientBackground(this.scene!, size);
      }

      this.setupObjectInScene();

      addLighting(this.scene!, this.options.lightning);
      addHelpers(this.scene!, this.object, this.options.helpers);

      if (this.options.camera.autoFitToObject && this.object) {
        fitCameraToObject(this.scene!, this.camera);
      }

      const center = new THREE.Vector3();
      this.scene!.position.copy(center);
      this.controls.target.copy(center);
      this.controls.update();

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        ThreeViewerError.fromError(
          error,
          ErrorCode.SCENE_INIT_FAILED,
          { phase: 'setupScene' }
        )
      );
    }
  }

  private setupObjectInScene(): void {
    if (this.object && this.scene) {
      this.object.castShadow = true;
      this.object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.scene.add(this.object);
    }
  }

  dispose(): void {
    if (this.scene) {
      // Remove all children from scene
      while (this.scene.children.length > 0) {
        const child = this.scene.children[0];
        this.scene.remove(child);
        
        // Dispose of geometries and materials
        if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
          child.geometry?.dispose();
          
          const material = child.material;
          if (Array.isArray(material)) {
            material.forEach(m => m?.dispose());
          } else {
            material?.dispose();
          }
        }
      }
      
      this.scene = null;
    }
  }
}
