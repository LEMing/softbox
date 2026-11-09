import { ViewerState } from '../entities/ViewerState';
import { ThreeViewerError } from '../../errors';
import { IObject3D } from '../interfaces';

export interface StateChangeCallback {
  (state: ViewerState): void;
}

export class StateManager {
  private state: ViewerState;
  private readonly stateChangeCallbacks: Set<StateChangeCallback>;

  constructor() {
    this.state = new ViewerState();
    this.stateChangeCallbacks = new Set();
  }

  getState(): ViewerState {
    return this.state;
  }

  setInitialized(): void {
    this.updateState(this.state.setInitialized());
  }

  startLoading(): void {
    this.updateState(this.state.startLoading());
  }

  setLoaded(model: IObject3D): void {
    this.updateState(this.state.setLoaded(model));
  }

  setError(error: ThreeViewerError): void {
    this.updateState(this.state.setError(error));
  }

  startRendering(): void {
    this.updateState(this.state.startRendering());
  }

  updateRenderInfo(info: { frameCount: number; fps: number; lastRenderTime: number }): void {
    this.updateState(this.state.updateRenderInfo(info));
  }

  setDisposed(): void {
    this.updateState(this.state.dispose());
  }

  canLoad(): boolean {
    return this.state.canLoad();
  }

  isInitialized(): boolean {
    return this.state.isInitialized;
  }

  getStatus(): 'idle' | 'loading' | 'loaded' | 'rendering' | 'error' | 'disposed' {
    return this.state.status;
  }

  getCurrentModel(): IObject3D | null {
    return this.state.currentModel;
  }

  onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback);
    
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  clearCallbacks(): void {
    this.stateChangeCallbacks.clear();
  }

  private updateState(newState: ViewerState): void {
    this.state = newState;
    
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(newState);
      } catch (error) {
        console.error('Error in state change callback:', error);
      }
    });
  }
}