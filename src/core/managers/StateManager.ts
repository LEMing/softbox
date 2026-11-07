import { ViewerState } from '../entities/ViewerState';
import { ThreeViewerError } from '../../errors';
import { IObject3D } from '../interfaces';

export interface StateChangeCallback {
  (state: ViewerState): void;
}

/**
 * Manages viewer state transitions and notifications
 */
export class StateManager {
  private state: ViewerState;
  private readonly stateChangeCallbacks: Set<StateChangeCallback>;

  constructor() {
    this.state = new ViewerState();
    this.stateChangeCallbacks = new Set();
  }

  /**
   * Get current state
   */
  getState(): ViewerState {
    return this.state;
  }

  /**
   * Set initialized state
   */
  setInitialized(): void {
    this.updateState(this.state.setInitialized());
  }

  /**
   * Start loading state
   */
  startLoading(): void {
    this.updateState(this.state.startLoading());
  }

  /**
   * Set loaded state with model
   */
  setLoaded(model: IObject3D): void {
    this.updateState(this.state.setLoaded(model));
  }

  /**
   * Set error state
   */
  setError(error: ThreeViewerError): void {
    this.updateState(this.state.setError(error));
  }

  /**
   * Start rendering state
   */
  startRendering(): void {
    this.updateState(this.state.startRendering());
  }

  /**
   * Update render info
   */
  updateRenderInfo(info: { frameCount: number; fps: number; lastRenderTime: number }): void {
    this.updateState(this.state.updateRenderInfo(info));
  }

  /**
   * Set disposed state
   */
  setDisposed(): void {
    this.updateState(this.state.dispose());
  }

  /**
   * Check if can load model in current state
   */
  canLoad(): boolean {
    return this.state.canLoad();
  }

  /**
   * Check if viewer is initialized
   */
  isInitialized(): boolean {
    return this.state.isInitialized;
  }

  /**
   * Get current status
   */
  getStatus(): 'idle' | 'loading' | 'loaded' | 'rendering' | 'error' | 'disposed' {
    return this.state.status;
  }

  /**
   * Get current model
   */
  getCurrentModel(): IObject3D | null {
    return this.state.currentModel;
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  /**
   * Clear all callbacks
   */
  clearCallbacks(): void {
    this.stateChangeCallbacks.clear();
  }

  /**
   * Update state and notify listeners
   */
  private updateState(newState: ViewerState): void {
    this.state = newState;
    
    // Notify all listeners
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(newState);
      } catch (error) {
        console.error('Error in state change callback:', error);
      }
    });
  }
}