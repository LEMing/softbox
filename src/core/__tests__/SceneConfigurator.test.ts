import { SceneConfigurator } from '../SceneConfigurator';
import { IScene, ITexture, Result } from '../interfaces';
import { ISceneSetupService } from '../services/ISceneSetupService';
import { IEnvironmentService } from '../services/IEnvironmentService';
import { IRenderer } from '../interfaces/IRenderer';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';

type Overrides = Record<string, unknown>;

const ok = () => Result.ok(undefined);

const makeScene = (): jest.Mocked<IScene> => ({}) as unknown as jest.Mocked<IScene>;
const makeRenderer = (): IRenderer => ({}) as unknown as IRenderer;
const makeTexture = (): ITexture => ({ id: 't', image: null, needsUpdate: false, dispose: jest.fn() });

const makeSceneSetup = (overrides: Overrides = {}): jest.Mocked<ISceneSetupService> =>
  ({
    addHelpers: jest.fn(() => ok()),
    addLighting: jest.fn(() => ok()),
    createGradientBackground: jest.fn(() => ok()),
    ...overrides,
  }) as unknown as jest.Mocked<ISceneSetupService>;

const makeEnvironment = (): jest.Mocked<IEnvironmentService> =>
  ({
    initialize: jest.fn(async () => ok()),
    loadEnvironmentMap: jest.fn(async () => Result.ok(makeTexture())),
    applyToScene: jest.fn(() => ok()),
    createStudioEnvironment: jest.fn(() => Result.ok(makeTexture())),
    dispose: jest.fn(),
  }) as unknown as jest.Mocked<IEnvironmentService>;

describe('SceneConfigurator', () => {
  let configurator: SceneConfigurator;

  beforeEach(() => {
    configurator = new SceneConfigurator();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  describe('configureScene', () => {
    it('applies helpers, lighting and a solid background', () => {
      const scene = makeScene();
      const sceneSetup = makeSceneSetup();
      const options: SimpleViewerOptions = {
        helpers: { grid: true, axes: true },
        lighting: {
          ambientLight: { color: '#fff', intensity: 1 },
          hemisphereLight: { skyColor: '#fff', groundColor: '#000', intensity: 1 },
          directionalLight: { color: '#fff', intensity: 1, position: [1, 2, 3] },
        },
        backgroundColor: '#123456',
      };

      configurator.configureScene(scene, sceneSetup, options);

      expect(sceneSetup.addHelpers).toHaveBeenCalled();
      expect(sceneSetup.addLighting).toHaveBeenCalled();
      expect(sceneSetup.createGradientBackground).toHaveBeenCalledWith(scene, {
        topColor: '#123456',
        bottomColor: '#123456',
      });
    });

    it('maps fill/rim accent lights through to addLighting', () => {
      const sceneSetup = makeSceneSetup();
      configurator.configureScene(makeScene(), sceneSetup, {
        lighting: {
          directionalLight: { color: '#fff', intensity: 2, position: [40, 90, 40], castShadow: true },
          fillLight: { color: '#eef2ff', intensity: 0.6, position: [-55, 28, 34] },
          rimLight: { color: '#f2f6ff', intensity: 2.6, position: [18, 52, -72] },
        },
      });
      expect(sceneSetup.addLighting).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fill: { color: '#eef2ff', intensity: 0.6, position: [-55, 28, 34] },
          rim: { color: '#f2f6ff', intensity: 2.6, position: [18, 52, -72] },
        })
      );
    });

    it('leaves an accent colour undefined rather than passing the string "undefined"', () => {
      const sceneSetup = makeSceneSetup();
      configurator.configureScene(makeScene(), sceneSetup, {
        lighting: { fillLight: { intensity: 0.6 } },
      });
      const mapped = sceneSetup.addLighting.mock.calls[0][1];
      expect(mapped.fill).toEqual({ color: undefined, intensity: 0.6, position: undefined });
    });

    it('normalizes a {x,y,z} light position to a tuple (honours the Vec3Like type)', () => {
      const sceneSetup = makeSceneSetup();
      configurator.configureScene(makeScene(), sceneSetup, {
        lighting: {
          directionalLight: { position: { x: 40, y: 90, z: 40 }, castShadow: true },
          rimLight: { position: { x: 18, y: 52, z: -72 } },
        },
      });
      const mapped = sceneSetup.addLighting.mock.calls[0][1];
      expect(mapped.directional?.position).toEqual([40, 90, 40]);
      expect(mapped.rim?.position).toEqual([18, 52, -72]);
    });

    it('paints a radial vignette when a backgroundColorEdge is given', () => {
      const sceneSetup = makeSceneSetup();
      const scene = makeScene();
      configurator.configureScene(scene, sceneSetup, {
        backgroundColor: '#242430',
        backgroundColorEdge: '#050507',
      });
      expect(sceneSetup.createGradientBackground).toHaveBeenCalledWith(scene, {
        topColor: '#242430',
        bottomColor: '#050507',
        radial: true,
      });
    });

    it('skips the background when an environment URL will own it', () => {
      const sceneSetup = makeSceneSetup();
      configurator.configureScene(makeScene(), sceneSetup, {
        backgroundColor: '#123456',
        environment: { url: 'env.hdr' },
      });
      expect(sceneSetup.createGradientBackground).not.toHaveBeenCalled();
    });

    it('keeps the clean background color under the (non-dark) studio environment', () => {
      const sceneSetup = makeSceneSetup();
      configurator.configureScene(makeScene(), sceneSetup, {
        backgroundColor: '#123456',
        helpers: { studioEnvironment: true },
      });
      expect(sceneSetup.createGradientBackground).toHaveBeenCalledWith(expect.anything(), {
        topColor: '#123456',
        bottomColor: '#123456',
      });
    });

    it('skips the background when dark studio mode will own it', () => {
      const sceneSetup = makeSceneSetup();
      configurator.configureScene(makeScene(), sceneSetup, {
        backgroundColor: '#123456',
        helpers: { studioEnvironment: true, darkStudioMode: true },
      });
      expect(sceneSetup.createGradientBackground).not.toHaveBeenCalled();
    });

    it('warns but does not throw when a section fails', () => {
      const fail = () => Result.err(new Error('boom') as never);
      const sceneSetup = makeSceneSetup({
        addHelpers: jest.fn(fail),
        addLighting: jest.fn(fail),
        createGradientBackground: jest.fn(fail),
      });
      expect(() =>
        configurator.configureScene(makeScene(), sceneSetup, {
          helpers: { grid: true },
          lighting: { ambientLight: { color: '#fff', intensity: 1 } },
          backgroundColor: '#123456',
        })
      ).not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('configureEnvironment', () => {
    const notDisposed = () => false;

    it('initializes the service and applies a loaded environment map', async () => {
      const scene = makeScene();
      const env = makeEnvironment();
      await configurator.configureEnvironment(
        scene, env, makeSceneSetup(), makeRenderer(), { environment: { url: 'env.hdr' } }, notDisposed
      );
      expect(env.initialize).toHaveBeenCalled();
      expect(env.loadEnvironmentMap).toHaveBeenCalledWith('env.hdr');
      expect(env.applyToScene).toHaveBeenCalled();
    });

    it('lights from the studio environment without painting it as the background', async () => {
      const env = makeEnvironment();
      await configurator.configureEnvironment(
        makeScene(), env, makeSceneSetup(), makeRenderer(),
        { helpers: { studioEnvironment: true } }, notDisposed
      );
      expect(env.createStudioEnvironment).toHaveBeenCalled();
      expect(env.applyToScene).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ setBackground: false })
      );
    });

    it('applies the studio environment and a dark background in dark studio mode', async () => {
      const env = makeEnvironment();
      const sceneSetup = makeSceneSetup();
      await configurator.configureEnvironment(
        makeScene(), env, sceneSetup, makeRenderer(),
        { helpers: { studioEnvironment: true, darkStudioMode: true } }, notDisposed
      );
      expect(env.createStudioEnvironment).toHaveBeenCalled();
      expect(env.applyToScene).toHaveBeenCalled();
      expect(sceneSetup.createGradientBackground).toHaveBeenCalled();
    });

    it('aborts after env init when the viewer was disposed (no map load)', async () => {
      const env = makeEnvironment();
      await configurator.configureEnvironment(
        makeScene(), env, makeSceneSetup(), makeRenderer(),
        { environment: { url: 'env.hdr' } }, () => true
      );
      expect(env.initialize).toHaveBeenCalled();
      expect(env.loadEnvironmentMap).not.toHaveBeenCalled();
      expect(env.applyToScene).not.toHaveBeenCalled();
    });

    it('aborts after map load when disposed mid-load (no applyToScene)', async () => {
      const env = makeEnvironment();
      let calls = 0;
      // Disposed only after the env map has loaded (second isDisposed check).
      const isDisposed = () => calls++ >= 1;
      await configurator.configureEnvironment(
        makeScene(), env, makeSceneSetup(), makeRenderer(),
        { environment: { url: 'env.hdr' } }, isDisposed
      );
      expect(env.loadEnvironmentMap).toHaveBeenCalled();
      expect(env.applyToScene).not.toHaveBeenCalled();
    });
  });
});
