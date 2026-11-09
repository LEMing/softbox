import * as THREE from 'three';
import { ThreeSceneSetupService } from '../ThreeSceneSetupService';
import { CONTACT_SHADOW_BAKED_NAME, CONTACT_SHADOW_LIVE_NAME } from '../ContactShadowBaker';

const createMockThreeRenderer = () => {
  const renderer = Object.create(THREE.WebGLRenderer.prototype) as THREE.WebGLRenderer;
  Object.assign(renderer, {
    shadowMap: { enabled: true, autoUpdate: true },
    capabilities: { isWebGL2: true, textureTypeReadable: jest.fn(() => true) },
    autoClear: true,
    getRenderTarget: jest.fn(() => null),
    setRenderTarget: jest.fn(),
    getClearColor: jest.fn((target: THREE.Color) => target.set('#000000')),
    getClearAlpha: jest.fn(() => 1),
    setClearColor: jest.fn(),
    clear: jest.fn(),
    render: jest.fn(),
    getContext: jest.fn(() => ({ isContextLost: () => false })),
    readRenderTargetPixels: jest.fn(),
  });
  return renderer;
};

const sceneFailingWith = (method: 'traverse' | 'getObjectByName') => {
  const scene = new THREE.Scene();
  jest.spyOn(scene, method).mockImplementation(() => {
    throw new Error('scene operation failed');
  });
  return scene;
};

const createSceneWithLight = () => {
  const threeScene = new THREE.Scene();
  const light = new THREE.DirectionalLight('#ffffff', 2);
  light.position.set(40, 90, 40);
  light.castShadow = true;
  threeScene.add(light);

  const model = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  threeScene.add(model);

  return { threeScene, light, model };
};

describe('ThreeSceneSetupService contact shadow', () => {
  describe('bakeContactShadow', () => {
    it('bakes and installs the contact shadow mesh', () => {
      const { threeScene, model } = createSceneWithLight();
      const service = new ThreeSceneSetupService();

      const result = service.bakeContactShadow(
        threeScene,
        model,
        createMockThreeRenderer()
      );

      expect(result.ok).toBe(true);
      expect(threeScene.getObjectByName(CONTACT_SHADOW_BAKED_NAME)).toBeDefined();
    });

    it('frees the bake target and disc when accumulation fails mid-bake', () => {
      const { threeScene, model } = createSceneWithLight();
      const service = new ThreeSceneSetupService();
      const internal = createMockThreeRenderer();
      (internal.render as jest.Mock).mockImplementation(() => {
        throw new Error('device error mid-pass');
      });
      const targetDispose = jest.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose');

      const result = service.bakeContactShadow(
        threeScene,
        model,
        internal
      );

      expect(result.ok).toBe(false);
      expect(targetDispose).toHaveBeenCalled();
      expect(threeScene.getObjectByName(CONTACT_SHADOW_BAKED_NAME)).toBeUndefined();
      targetDispose.mockRestore();
    });

    it('wraps a failing scene walk into an error result', () => {
      const service = new ThreeSceneSetupService();
      const model = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));

      const result = service.bakeContactShadow(
        sceneFailingWith('traverse'),
        model,
        createMockThreeRenderer()
      );

      expect(result.ok).toBe(false);
    });

    it('no-ops before the renderer exists', () => {
      const { threeScene, model } = createSceneWithLight();
      const service = new ThreeSceneSetupService();

      const result = service.bakeContactShadow(
        threeScene,
        model,
        null
      );

      expect(result.ok).toBe(true);
      expect(threeScene.getObjectByName(CONTACT_SHADOW_BAKED_NAME)).toBeUndefined();
    });

    it('no-ops when shadow maps are disabled', () => {
      const { threeScene, model } = createSceneWithLight();
      const renderer = createMockThreeRenderer();
      renderer.shadowMap.enabled = false;
      const service = new ThreeSceneSetupService();

      const result = service.bakeContactShadow(
        threeScene,
        model,
        renderer
      );

      expect(result.ok).toBe(true);
      expect(threeScene.getObjectByName(CONTACT_SHADOW_BAKED_NAME)).toBeUndefined();
    });

    it('no-ops without a shadow-casting directional light', () => {
      const threeScene = new THREE.Scene();
      const model = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      threeScene.add(model);
      const service = new ThreeSceneSetupService();

      const result = service.bakeContactShadow(
        threeScene,
        model,
        createMockThreeRenderer()
      );

      expect(result.ok).toBe(true);
      expect(threeScene.getObjectByName(CONTACT_SHADOW_BAKED_NAME)).toBeUndefined();
    });
  });

  describe('resetContactShadow', () => {
    it('evicts the stale baked disc and puts the live catcher back in charge', () => {
      const threeScene = new THREE.Scene();
      const baked = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
      baked.name = CONTACT_SHADOW_BAKED_NAME;
      const disposeSpy = jest.spyOn(baked.geometry, 'dispose');
      const live = new THREE.Mesh(new THREE.CircleGeometry(1, 8));
      live.name = CONTACT_SHADOW_LIVE_NAME;
      live.visible = false;
      threeScene.add(baked, live);
      const service = new ThreeSceneSetupService();

      const result = service.resetContactShadow(threeScene);

      expect(result.ok).toBe(true);
      expect(threeScene.getObjectByName(CONTACT_SHADOW_BAKED_NAME)).toBeUndefined();
      expect(disposeSpy).toHaveBeenCalled();
      expect(live.visible).toBe(true);
    });

    it('wraps a failing scene lookup into an error result', () => {
      const service = new ThreeSceneSetupService();
      const result = service.resetContactShadow(sceneFailingWith('getObjectByName'));
      expect(result.ok).toBe(false);
    });
  });

  describe('setContactShadowMode', () => {
    const createSceneWithBothShadows = () => {
      const threeScene = new THREE.Scene();
      const baked = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
      baked.name = CONTACT_SHADOW_BAKED_NAME;
      const live = new THREE.Mesh(new THREE.CircleGeometry(1, 8));
      live.name = CONTACT_SHADOW_LIVE_NAME;
      live.visible = false;
      threeScene.add(baked);
      threeScene.add(live);
      return { threeScene, baked, live };
    };

    it("switches to the live catcher for animation playback", () => {
      const { threeScene, baked, live } = createSceneWithBothShadows();
      const service = new ThreeSceneSetupService();

      const result = service.setContactShadowMode(threeScene, 'live');

      expect(result.ok).toBe(true);
      expect(baked.visible).toBe(false);
      expect(live.visible).toBe(true);
    });

    it('switches back to the baked shadow', () => {
      const { threeScene, baked, live } = createSceneWithBothShadows();
      const service = new ThreeSceneSetupService();
      service.setContactShadowMode(threeScene, 'live');

      const result = service.setContactShadowMode(threeScene, 'baked');

      expect(result.ok).toBe(true);
      expect(baked.visible).toBe(true);
      expect(live.visible).toBe(false);
    });

    it('keeps the live catcher up when no baked shadow exists', () => {
      const threeScene = new THREE.Scene();
      const live = new THREE.Mesh(new THREE.CircleGeometry(1, 8));
      live.name = CONTACT_SHADOW_LIVE_NAME;
      threeScene.add(live);
      const service = new ThreeSceneSetupService();

      const result = service.setContactShadowMode(threeScene, 'baked');

      expect(result.ok).toBe(true);
      expect(live.visible).toBe(true);
    });

    it('wraps a failing scene lookup into an error result', () => {
      const service = new ThreeSceneSetupService();

      const result = service.setContactShadowMode(sceneFailingWith('getObjectByName'), 'baked');

      expect(result.ok).toBe(false);
    });
  });
});
