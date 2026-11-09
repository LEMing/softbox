import { ViewerEventMap as CoreEventMap } from '../../core/events/CoreViewerEvents';
import { ViewerEventMap as PresentationEventMap } from '../../events/ViewerEvents';
import { IObject3D } from '../../core/interfaces/IObject3D';
import { ICamera } from '../../core/interfaces/ICamera';
import { IControls } from '../../core/interfaces/IControls';
import * as THREE from 'three';
import { ControlsInstance } from '../../types/CommonTypes';
import { SimpleViewerHandle } from '../../types/SimpleViewerHandle';
import { toThreeCamera, toThreeControls, toThreeObject } from '../../infrastructure/three/unwrap';

export class EventAdapter {
  private static toThreeObject(obj: IObject3D): THREE.Object3D {
    const unwrapped = toThreeObject(obj);
    if (unwrapped) {
      return unwrapped;
    }
    const fallback = new THREE.Object3D();
    fallback.position.set(obj.position.x, obj.position.y, obj.position.z);
    fallback.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
    fallback.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
    return fallback;
  }

  private static toThreeCamera(camera: ICamera): THREE.Camera {
    return toThreeCamera(camera) ?? new THREE.PerspectiveCamera();
  }

  private static toThreeControls(controls: IControls): ControlsInstance {
    return toThreeControls(controls) ?? (controls as unknown as ControlsInstance);
  }

  static convertModelLoaded(data: CoreEventMap['model:loaded']): PresentationEventMap['model:loaded'] {
    return {
      model: this.toThreeObject(data.model),
      loadTime: data.loadTime
    };
  }

  static convertControlsChange(data: CoreEventMap['controls:change']): PresentationEventMap['controls:change'] {
    return {
      type: data.type,
      camera: data.camera ? this.toThreeCamera(data.camera) : undefined,
      controls: data.controls ? this.toThreeControls(data.controls) : undefined
    };
  }

  static convertObjectSelected(data: CoreEventMap['object:selected']): PresentationEventMap['object:selected'] {
    return {
      object: this.toThreeObject(data.object),
      point: data.point
    };
  }

  static convertInitialized(data: CoreEventMap['initialized'], viewerHandle: SimpleViewerHandle): PresentationEventMap['initialized'] {
    return {
      viewer: viewerHandle
    };
  }

  static convertDisposed(data: CoreEventMap['disposed'], viewerHandle: SimpleViewerHandle): PresentationEventMap['disposed'] {
    return {
      viewer: viewerHandle
    };
  }
}