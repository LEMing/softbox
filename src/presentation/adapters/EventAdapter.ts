import { ViewerEventMap as CoreEventMap } from '../../core/events/ViewerEvents';
import { ViewerEventMap as PresentationEventMap } from '../../events/ViewerEvents';
import { IObject3D } from '../../core/interfaces/IObject3D';
import { ICamera } from '../../core/interfaces/ICamera';
import { IControls } from '../../core/interfaces/IControls';
import * as THREE from 'three';
import { ControlsInstance } from '../../types/CommonTypes';
import { SimpleViewerHandle } from '../../types/SimpleViewerHandle';
import { toThreeCamera, toThreeControls, toThreeObject } from '../../infrastructure/three/unwrap';

/**
 * Converts core event data to presentation layer event data
 */
export class EventAdapter {
  /**
   * Convert IObject3D to THREE.Object3D
   */
  private static toThreeObject(obj: IObject3D): THREE.Object3D {
    const unwrapped = toThreeObject(obj);
    if (unwrapped) {
      return unwrapped;
    }
    // Non-adapter core object: mirror its transform onto a generic Object3D.
    const fallback = new THREE.Object3D();
    fallback.position.set(obj.position.x, obj.position.y, obj.position.z);
    fallback.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
    fallback.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
    return fallback;
  }

  /**
   * Convert ICamera to THREE.Camera
   */
  private static toThreeCamera(camera: ICamera): THREE.Camera {
    return toThreeCamera(camera) ?? new THREE.PerspectiveCamera();
  }

  /**
   * Convert IControls to ControlsInstance
   */
  private static toThreeControls(controls: IControls): ControlsInstance {
    return toThreeControls(controls) ?? (controls as unknown as ControlsInstance);
  }

  /**
   * Convert model:loaded event
   */
  static convertModelLoaded(data: CoreEventMap['model:loaded']): PresentationEventMap['model:loaded'] {
    return {
      model: this.toThreeObject(data.model),
      loadTime: data.loadTime
    };
  }

  /**
   * Convert controls:change event
   */
  static convertControlsChange(data: CoreEventMap['controls:change']): PresentationEventMap['controls:change'] {
    return {
      type: data.type,
      camera: data.camera ? this.toThreeCamera(data.camera) : undefined,
      controls: data.controls ? this.toThreeControls(data.controls) : undefined
    };
  }

  /**
   * Convert object:selected event
   */
  static convertObjectSelected(data: CoreEventMap['object:selected']): PresentationEventMap['object:selected'] {
    return {
      object: this.toThreeObject(data.object),
      point: data.point
    };
  }

  /**
   * Convert initialized event
   * For now, we'll pass the viewer handle as unknown
   */
  static convertInitialized(data: CoreEventMap['initialized'], viewerHandle: SimpleViewerHandle): PresentationEventMap['initialized'] {
    return {
      viewer: viewerHandle
    };
  }

  /**
   * Convert disposed event
   */
  static convertDisposed(data: CoreEventMap['disposed'], viewerHandle: SimpleViewerHandle): PresentationEventMap['disposed'] {
    return {
      viewer: viewerHandle
    };
  }
}