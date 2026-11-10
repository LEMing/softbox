import { ICamera, IVector3 } from '../interfaces';

export interface SerializedSceneState {
  modelUrl?: string;
  cameraPosition: { x: number; y: number; z: number };
  cameraTarget: { x: number; y: number; z: number };
  controlsTarget: { x: number; y: number; z: number };
  rendererSize: { width: number; height: number };
}

export class SceneSerializer {
  static serialize(
    modelUrl: string | undefined,
    camera: ICamera,
    controls: { target?: IVector3 },
    canvas: HTMLCanvasElement
  ): SerializedSceneState {
    const cameraPos = camera.position;
    
    const target: IVector3 = controls.target || { x: 0, y: 0, z: 0, set: () => {}, copy: () => {}, add: () => {}, multiply: () => {}, normalize: () => {}, length: () => 0 };
    
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
    camera: ICamera,
    controls: { target?: IVector3; update?: () => void },
    loadModel?: (url: string) => Promise<void>
  ): Promise<void> {
    camera.position.set(
      state.cameraPosition.x,
      state.cameraPosition.y,
      state.cameraPosition.z
    );
    
    camera.lookAt({
      x: state.cameraTarget.x,
      y: state.cameraTarget.y,
      z: state.cameraTarget.z,
      set: () => {},
      copy: () => {},
      add: () => {},
      multiply: () => {},
      normalize: () => {},
      length: () => 0
    });
    
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