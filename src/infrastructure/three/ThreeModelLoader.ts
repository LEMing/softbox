import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import type { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import {
  IModelLoader,
  IModel,
  IAnimation
} from '../../core/interfaces/IModelLoader';
import { LoaderOptions } from '../../types/options';
import { Result } from '../../utils/Result';
import { buildRaycastBvh } from './bvh';
import { ThreeObject3DAdapter } from './ThreeObject3D';
import { ThreeViewerError, ErrorCode } from '../../errors';
import * as THREE from 'three';

/**
 * Runtime configuration for the GLTF loader adapter: which compression decoders
 * to wire up and where their WebAssembly lives. The renderer is required only to
 * detect which KTX2/Basis texture formats the GPU supports.
 */
export interface GLTFLoaderConfig extends LoaderOptions {
  renderer?: THREE.WebGLRenderer;
  /** Build a raycast BVH for the loaded model (`selection.bvh`, default on). */
  bvh?: boolean;
}

/**
 * Version-pinned CDN for the Three.js decoder binaries, matched to the installed
 * revision so the fetched decoder always agrees with the add-on. Only hit on
 * demand — the first time an asset actually uses DRACO or KTX2. Override via
 * `dracoDecoderPath` / `ktx2TranscoderPath` to self-host offline.
 */
const THREE_REVISION = THREE.REVISION.replace(/\D/g, '');
const THREE_CDN_LIBS = `https://cdn.jsdelivr.net/npm/three@0.${THREE_REVISION}/examples/jsm/libs`;
const DEFAULT_DRACO_DECODER_PATH = `${THREE_CDN_LIBS}/draco/`;
const DEFAULT_KTX2_TRANSCODER_PATH = `${THREE_CDN_LIBS}/basis/`;

/**
 * Adapter for Three.js GLTFLoader to implement IModelLoader. Wires the DRACO,
 * KTX2/Basis and Meshopt decoders so compressed assets load out of the box.
 *
 * The decoders are imported lazily on the first load: each embeds a large
 * WebAssembly blob, so a static import would inflate the bundle for every
 * consumer regardless of whether their assets are compressed. Dynamic `import()`
 * keeps them in a separate chunk and, unlike a static import of these ESM-only
 * add-ons, also works when the library is consumed from CommonJS.
 */
export class ThreeGLTFLoaderAdapter implements IModelLoader {
  private loader: GLTFLoader;
  private loadingManager: THREE.LoadingManager;
  private readonly config: GLTFLoaderConfig;
  private decodersReady?: Promise<void>;
  private dracoLoader?: DRACOLoader;
  private ktx2Loader?: KTX2Loader;

  constructor(config: GLTFLoaderConfig = {}) {
    this.loadingManager = new THREE.LoadingManager();
    this.loader = new GLTFLoader(this.loadingManager);
    this.config = config;
  }

  private ensureDecoders(): Promise<void> {
    if (!this.decodersReady) {
      this.decodersReady = this.configureDecoders();
    }
    return this.decodersReady;
  }

  private async configureDecoders(): Promise<void> {
    const config = this.config;
    const tasks: Array<Promise<void>> = [];
    if (config.draco ?? true) tasks.push(this.configureDraco(config));
    if (config.ktx2 ?? true) tasks.push(this.configureKtx2(config));
    if (config.meshopt ?? true) tasks.push(this.configureMeshopt());

    const outcomes = await Promise.allSettled(tasks);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        // Best-effort: a decoder that fails to load only breaks assets that
        // actually use it, which GLTFLoader then reports on its own.
        console.warn(
          'softbox: a compression decoder failed to initialize; compressed assets using it may not load.',
          outcome.reason
        );
      }
    }
  }

  private async configureDraco(config: GLTFLoaderConfig): Promise<void> {
    const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
    const draco = new DRACOLoader(this.loadingManager);
    draco.setDecoderPath(config.dracoDecoderPath ?? DEFAULT_DRACO_DECODER_PATH);
    this.dracoLoader = draco;
    this.loader.setDRACOLoader(draco);
  }

  private async configureKtx2(config: GLTFLoaderConfig): Promise<void> {
    const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js');
    const ktx2 = new KTX2Loader(this.loadingManager);
    ktx2.setTranscoderPath(config.ktx2TranscoderPath ?? DEFAULT_KTX2_TRANSCODER_PATH);
    if (config.renderer) {
      ktx2.detectSupport(config.renderer);
    }
    this.ktx2Loader = ktx2;
    this.loader.setKTX2Loader(ktx2);
  }

  private async configureMeshopt(): Promise<void> {
    // `@types/three` types this module via `export * from "meshoptimizer/decoder"`,
    // a subpath export that resolves inconsistently across our two tsconfigs, so
    // the `MeshoptDecoder` named export is not reliably visible. Read it through a
    // structural cast and hand it back as the setter's own parameter type.
    const meshoptModule = (await import(
      'three/examples/jsm/libs/meshopt_decoder.module.js'
    )) as unknown as { MeshoptDecoder: unknown };
    this.loader.setMeshoptDecoder(
      meshoptModule.MeshoptDecoder as Parameters<GLTFLoader['setMeshoptDecoder']>[0]
    );
  }

  async load(url: string, onProgress?: (loaded: number, total: number) => void): Promise<Result<IModel>> {
    try {
      await this.ensureDecoders();
      return new Promise((resolve) => {
        this.loader.load(
          url,
          (gltf) => {
            // Accelerate click-picking/occlusion raycasts on large models.
            if (this.config.bvh ?? true) {
              buildRaycastBvh(gltf.scene);
            }
            // GLTFLoader keeps clips off the scene; the animation service
            // reads them from the model root (the standard three convention).
            gltf.scene.animations = gltf.animations;
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
            if (progress.total > 0) {
              onProgress?.(progress.loaded, progress.total);
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

  /**
   * Free the DRACO/KTX2 decoder worker pools. GLTFLoader itself is stateless, but
   * the decoders spin up Web Workers on first use that must be terminated.
   */
  dispose(): void {
    this.dracoLoader?.dispose();
    this.ktx2Loader?.dispose();
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
  static createLoader(url: string, config: GLTFLoaderConfig = {}): IModelLoader {
    const extension = url.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'gltf':
      case 'glb':
        return new ThreeGLTFLoaderAdapter(config);
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