import type * as THREE from 'three';

export interface SerializedSceneState {
  modelUrl?: string;
  cameraPosition: { x: number; y: number; z: number };
  cameraTarget: { x: number; y: number; z: number };
  controlsTarget: { x: number; y: number; z: number };
  rendererSize: { width: number; height: number };
}

const ORIGIN = { x: 0, y: 0, z: 0 };

export class SceneSerializer {
  static serialize(
    modelUrl: string | undefined,
    camera: THREE.Camera,
    controls: { target?: THREE.Vector3 },
    canvas: HTMLCanvasElement
  ): SerializedSceneState {
    const cameraPos = camera.position;

    const target = controls.target ?? ORIGIN;

    return {
      modelUrl,
      cameraPosition: { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z },
      cameraTarget: { x: target.x, y: target.y, z: target.z },
      controlsTarget: { x: target.x, y: target.y, z: target.z },
      rendererSize: {
        width: canvas.clientWidth,
        height: canvas.clientHeight
      }
    };
  }

  static async restore(
    state: SerializedSceneState,
    camera: THREE.Camera,
    controls: { target?: THREE.Vector3; update?: () => void },
    loadModel?: (url: string) => Promise<void>
  ): Promise<void> {
    camera.position.set(
      state.cameraPosition.x,
      state.cameraPosition.y,
      state.cameraPosition.z
    );

    camera.lookAt(state.cameraTarget.x, state.cameraTarget.y, state.cameraTarget.z);

    if (controls.target) {
      controls.target.set(
        state.controlsTarget.x,
        state.controlsTarget.y,
        state.controlsTarget.z
      );
    }

    if (controls.update) {
      controls.update();
    }

    if (state.modelUrl && loadModel) {
      await loadModel(state.modelUrl);
    }
  }
}
