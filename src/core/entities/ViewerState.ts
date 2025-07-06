import { IObject3D } from '../interfaces/IObject3D';
import { ThreeViewerError } from '../../errors/ThreeViewerError';

export type ViewerStatus = 
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'error'
  | 'rendering'
  | 'disposed';

export interface ViewerStateData {
  status: ViewerStatus;
  currentModel: IObject3D | null;
  error: ThreeViewerError | null;
  isInitialized: boolean;
  loadProgress: number;
  renderInfo: RenderInfo;
}

export interface RenderInfo {
  frameCount: number;
  fps: number;
  lastRenderTime: number;
  averageRenderTime: number;
}

/**
 * Immutable state class for the viewer
 * Implements state machine pattern for viewer states
 */
export class ViewerState {
  private readonly data: Readonly<ViewerStateData>;

  constructor(data: Partial<ViewerStateData> = {}) {
    this.data = Object.freeze({
      status: 'idle',
      currentModel: null,
      error: null,
      isInitialized: false,
      loadProgress: 0,
      renderInfo: {
        frameCount: 0,
        fps: 0,
        lastRenderTime: 0,
        averageRenderTime: 0,
      },
      ...data,
    });
  }

  // Getters for state properties
  get status(): ViewerStatus {
    return this.data.status;
  }

  get currentModel(): IObject3D | null {
    return this.data.currentModel;
  }

  get error(): ThreeViewerError | null {
    return this.data.error;
  }

  get isInitialized(): boolean {
    return this.data.isInitialized;
  }

  get loadProgress(): number {
    return this.data.loadProgress;
  }

  get renderInfo(): RenderInfo {
    return this.data.renderInfo;
  }

  // State transitions
  setInitialized(): ViewerState {
    return new ViewerState({
      ...this.data,
      isInitialized: true,
      status: 'idle',
    });
  }

  startLoading(): ViewerState {
    return new ViewerState({
      ...this.data,
      status: 'loading',
      loadProgress: 0,
      error: null,
    });
  }

  updateLoadProgress(progress: number): ViewerState {
    return new ViewerState({
      ...this.data,
      loadProgress: Math.min(Math.max(0, progress), 1),
    });
  }

  setLoaded(model: IObject3D): ViewerState {
    return new ViewerState({
      ...this.data,
      status: 'loaded',
      currentModel: model,
      loadProgress: 1,
      error: null,
    });
  }

  setError(error: ThreeViewerError): ViewerState {
    return new ViewerState({
      ...this.data,
      status: 'error',
      error,
      loadProgress: 0,
    });
  }

  startRendering(): ViewerState {
    return new ViewerState({
      ...this.data,
      status: 'rendering',
    });
  }

  updateRenderInfo(info: Partial<RenderInfo>): ViewerState {
    return new ViewerState({
      ...this.data,
      renderInfo: {
        ...this.data.renderInfo,
        ...info,
      },
    });
  }

  dispose(): ViewerState {
    return new ViewerState({
      ...this.data,
      status: 'disposed',
      currentModel: null,
    });
  }

  // State validation
  canLoad(): boolean {
    return this.data.isInitialized && 
           (this.data.status === 'idle' || 
            this.data.status === 'loaded' || 
            this.data.status === 'error' ||
            this.data.status === 'rendering');
  }

  canRender(): boolean {
    return this.data.isInitialized && 
           this.data.status === 'loaded' && 
           this.data.currentModel !== null;
  }

  isLoading(): boolean {
    return this.data.status === 'loading';
  }

  hasError(): boolean {
    return this.data.status === 'error' && this.data.error !== null;
  }

  // Create a plain object representation
  toJSON(): ViewerStateData {
    return { ...this.data };
  }
}