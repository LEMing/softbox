import * as THREE from 'three';
import { 
  ICamera, 
  IPerspectiveCamera, 
  IOrthographicCamera 
} from '../../core/interfaces/ICamera';
import { IVector3 } from '../../core/interfaces/IObject3D';
import { ThreeObject3DAdapter } from './ThreeObject3D';
import { ThreeVector3Adapter } from './ThreeVector3';

/**
 * Base adapter for Three.js cameras
 */
export abstract class ThreeCameraAdapter extends ThreeObject3DAdapter implements ICamera {
  protected camera: THREE.Camera;

  constructor(camera: THREE.Camera) {
    super(camera);
    this.camera = camera;
  }

  abstract get type(): 'perspective' | 'orthographic';

  get near(): number {
    return this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera 
      ? this.camera.near 
      : 0.1;
  }

  set near(value: number) {
    if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
      this.camera.near = value;
    }
  }

  get far(): number {
    return this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera 
      ? this.camera.far 
      : 1000;
  }

  set far(value: number) {
    if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
      this.camera.far = value;
    }
  }

  lookAt(target: IVector3): void {
    if (target instanceof ThreeVector3Adapter) {
      this.camera.lookAt(target.getThreeVector());
    } else {
      this.camera.lookAt(target.x, target.y, target.z);
    }
  }

  updateProjectionMatrix(): void {
    if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
      this.camera.updateProjectionMatrix();
    }
  }

  getWorldDirection(target: IVector3): void {
    const threeVector = new THREE.Vector3();
    this.camera.getWorldDirection(threeVector);
    target.set(threeVector.x, threeVector.y, threeVector.z);
  }

  /**
   * Get the internal Three.js camera
   * Implementation of IRendererExtension interface
   */
  getInternalRenderer(): THREE.Camera | null {
    return this.camera;
  }
  
  // Legacy method for backward compatibility
  getThreeCamera(): THREE.Camera {
    return this.camera;
  }
}

/**
 * Adapter for Three.js PerspectiveCamera
 */
export class ThreePerspectiveCameraAdapter extends ThreeCameraAdapter implements IPerspectiveCamera {
  private perspectiveCamera: THREE.PerspectiveCamera;

  constructor(camera?: THREE.PerspectiveCamera) {
    const cam = camera || new THREE.PerspectiveCamera();
    super(cam);
    this.perspectiveCamera = cam;
  }

  get type(): 'perspective' {
    return 'perspective';
  }

  get fov(): number {
    return this.perspectiveCamera.fov;
  }

  set fov(value: number) {
    this.perspectiveCamera.fov = value;
  }

  get aspect(): number {
    return this.perspectiveCamera.aspect;
  }

  set aspect(value: number) {
    this.perspectiveCamera.aspect = value;
  }

  static create(
    fov: number = 75,
    aspect: number = 1,
    near: number = 0.1,
    far: number = 1000
  ): ThreePerspectiveCameraAdapter {
    return new ThreePerspectiveCameraAdapter(
      new THREE.PerspectiveCamera(fov, aspect, near, far)
    );
  }
}

/**
 * Adapter for Three.js OrthographicCamera
 */
export class ThreeOrthographicCameraAdapter extends ThreeCameraAdapter implements IOrthographicCamera {
  private orthographicCamera: THREE.OrthographicCamera;

  constructor(camera?: THREE.OrthographicCamera) {
    const cam = camera || new THREE.OrthographicCamera();
    super(cam);
    this.orthographicCamera = cam;
  }

  get type(): 'orthographic' {
    return 'orthographic';
  }

  get left(): number {
    return this.orthographicCamera.left;
  }

  set left(value: number) {
    this.orthographicCamera.left = value;
  }

  get right(): number {
    return this.orthographicCamera.right;
  }

  set right(value: number) {
    this.orthographicCamera.right = value;
  }

  get top(): number {
    return this.orthographicCamera.top;
  }

  set top(value: number) {
    this.orthographicCamera.top = value;
  }

  get bottom(): number {
    return this.orthographicCamera.bottom;
  }

  set bottom(value: number) {
    this.orthographicCamera.bottom = value;
  }

  get zoom(): number {
    return this.orthographicCamera.zoom;
  }

  set zoom(value: number) {
    this.orthographicCamera.zoom = value;
  }

  static create(
    left: number = -1,
    right: number = 1,
    top: number = 1,
    bottom: number = -1,
    near: number = 0.1,
    far: number = 1000
  ): ThreeOrthographicCameraAdapter {
    return new ThreeOrthographicCameraAdapter(
      new THREE.OrthographicCamera(left, right, top, bottom, near, far)
    );
  }
}