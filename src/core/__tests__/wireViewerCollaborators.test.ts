import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { wireViewerCollaborators, ViewerDependencies } from '../wireViewerCollaborators';
import { ViewerRenderer } from '../rendering/ViewerRenderer';
import { IModelLoader } from '../services/IModelLoader';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { RenderLoopManager } from '../utils/RenderLoopManager';
import { Result } from '../../utils/Result';

const makeDependencies = (options: SimpleViewerOptions): ViewerDependencies => ({
  renderer: {
    getDomElement: jest.fn(() => document.createElement('canvas')),
  } as unknown as ViewerRenderer,
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(),
  controls: { autoRotate: false } as unknown as OrbitControls,
  modelLoader: { load: jest.fn(async () => Result.ok({ scene: new THREE.Object3D() })) } as unknown as IModelLoader,
  options,
});

const makeShared = (initial: SimpleViewerOptions) => {
  let options = initial;
  return {
    getOptions: () => options,
    setOptions: (next: SimpleViewerOptions) => {
      options = next;
    },
    isDisposed: () => false,
  };
};

describe('wireViewerCollaborators', () => {
  it('builds the render loop from the rendering options', () => {
    const options: SimpleViewerOptions = {
      staticScene: true,
      rendering: { idleDelay: 250, targetFPS: 30, enableFrameRateLimiting: true },
    };

    const loop = wireViewerCollaborators(makeDependencies(options), makeShared(options)).renderLoopManager;

    expect(loop as unknown as Record<string, unknown>).toMatchObject({
      enableIdleDetection: true,
      idleDelay: 250,
      targetFPS: 30,
      enableFrameRateLimiting: true,
      alwaysRender: false,
    });
  });

  it('turns idle detection off for a live scene unless asked for', () => {
    const live: SimpleViewerOptions = { staticScene: false };
    const liveLoop = wireViewerCollaborators(makeDependencies(live), makeShared(live)).renderLoopManager;

    const forced: SimpleViewerOptions = { staticScene: false, rendering: { enableIdleDetection: true } };
    const forcedLoop = wireViewerCollaborators(makeDependencies(forced), makeShared(forced)).renderLoopManager;

    const idleDetection = (loop: RenderLoopManager) =>
      (loop as unknown as { enableIdleDetection: boolean }).enableIdleDetection;
    expect(idleDetection(liveLoop)).toBe(false);
    expect(idleDetection(forcedLoop)).toBe(true);
  });

  it('writes environment changes back through the shared options', async () => {
    const options: SimpleViewerOptions = { backgroundColor: '#111111' };
    const shared = makeShared(options);
    const dependencies: ViewerDependencies = {
      ...makeDependencies(options),
      environmentService: {
        loadEnvironmentMap: jest.fn(async () => Result.ok(new THREE.Texture())),
        applyToScene: jest.fn(() => Result.ok(undefined)),
      } as unknown as ViewerDependencies['environmentService'],
    };

    const collaborators = wireViewerCollaborators(dependencies, shared);
    const result = await collaborators.environment.setEnvironmentMap('studio.hdr');

    expect(result.ok).toBe(true);
    expect(shared.getOptions()).toEqual({ backgroundColor: '#111111', environment: { url: 'studio.hdr' } });
  });

  it('routes runtime option updates into the shared options', () => {
    const options: SimpleViewerOptions = {};
    const shared = makeShared(options);

    const collaborators = wireViewerCollaborators(makeDependencies(options), shared);
    collaborators.runtimeOptions.apply({ controls: { autoRotateSpeed: 5 } });

    expect(shared.getOptions().controls?.autoRotateSpeed).toBe(5);
  });
});
