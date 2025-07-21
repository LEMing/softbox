import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { 
  IModelLoader, 
  IModel, 
  IAnimation
} from '../../core/interfaces/IModelLoader';
import { Result } from '../../utils/Result';
import { ThreeObject3DAdapter } from './ThreeObject3D';
import { ThreeViewerError, ErrorCode } from '../../errors';
import * as THREE from 'three';

/**
 * Adapter for Three.js GLTFLoader to implement IModelLoader
 */
export class ThreeGLTFLoaderAdapter implements IModelLoader {
  private loader: GLTFLoader;
  private loadingManager: THREE.LoadingManager;

  constructor() {
    this.loadingManager = new THREE.LoadingManager();
    this.loader = new GLTFLoader(this.loadingManager);
  }

  async load(url: string): Promise<Result<IModel>> {
    try {
      return new Promise((resolve) => {
        this.loader.load(
          url,
          (gltf) => {
            // Convert Three.js scene to our abstraction
            const model: IModel = {
              scene: new ThreeObject3DAdapter(gltf.scene),
              animations: this.convertAnimations(gltf.animations),
              cameras: gltf.cameras?.map(cam => {
                const isPerspective = cam instanceof THREE.PerspectiveCamera;
                const isOrthographic = cam instanceof THREE.OrthographicCamera;
                
                return {
                  name: cam.name,
                  type: cam.type,
                  fov: isPerspective ? cam.fov : undefined,
                  aspect: isPerspective ? cam.aspect : undefined,
                  near: isPerspective ? cam.near : (isOrthographic ? cam.near : 0.1),
                  far: isPerspective ? cam.far : (isOrthographic ? cam.far : 1000),
                };
              }),
              userData: gltf.userData,
            };
            resolve(Result.ok(model));
          },
          (progress) => {
            // Progress callback - could emit events here
            if (progress.total > 0) {
              // Progress is available but not logged
              // percentComplete = (progress.loaded / progress.total) * 100;
            }
          },
          (error) => {
            resolve(Result.err(
              new ThreeViewerError(
                'Failed to load GLTF model',
                ErrorCode.MODEL_LOAD_FAILED,
                { url, originalError: error }
              )
            ));
          }
        );
      });
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to initiate model loading',
          ErrorCode.MODEL_LOAD_FAILED,
          { url, originalError: error }
        )
      );
    }
  }

  supports(url: string): boolean {
    const extension = url.split('.').pop()?.toLowerCase();
    return extension === 'gltf' || extension === 'glb';
  }

  private convertAnimations(animations: THREE.AnimationClip[]): IAnimation[] {
    return animations.map(clip => ({
      name: clip.name,
      duration: clip.duration,
      tracks: clip.tracks.map(track => ({
        name: track.name,
        type: this.getTrackType(track),
        times: track.times as Float32Array,
        values: track.values as Float32Array,
      })),
    }));
  }

  private getTrackType(track: THREE.KeyframeTrack): 'vector' | 'quaternion' | 'number' | 'boolean' {
    if (track instanceof THREE.VectorKeyframeTrack) return 'vector';
    if (track instanceof THREE.QuaternionKeyframeTrack) return 'quaternion';
    if (track instanceof THREE.NumberKeyframeTrack) return 'number';
    if (track instanceof THREE.BooleanKeyframeTrack) return 'boolean';
    return 'number'; // default
  }
}

/**
 * Factory for creating model loaders based on file type
 */
export class ModelLoaderFactory {
  static createLoader(url: string): IModelLoader {
    const extension = url.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'gltf':
      case 'glb':
        return new ThreeGLTFLoaderAdapter();
      // Add more loaders here in the future (FBX, OBJ, etc.)
      default:
        throw new ThreeViewerError(
          `Unsupported file format: ${extension}`,
          ErrorCode.UNSUPPORTED_FORMAT,
          { url, extension }
        );
    }
  }
}