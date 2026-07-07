import * as THREE from 'three';
import {
  ContactShadowBaker,
  CONTACT_SHADOW_BAKED_NAME,
  CONTACT_SHADOW_LIVE_NAME,
} from '../ContactShadowBaker';

const createMockRenderer = (isContextLost: () => boolean = () => false) => {
  const renderer = {
    shadowMap: { enabled: true, autoUpdate: true },
    capabilities: { isWebGL2: true, textureTypeReadable: jest.fn(() => true) },
    autoClear: true,
    getRenderTarget: jest.fn(() => null),
    setRenderTarget: jest.fn(),
    getClearColor: jest.fn((target: THREE.Color) => target.set('#123456')),
    getClearAlpha: jest.fn(() => 1),
    setClearColor: jest.fn(),
    clear: jest.fn(),
    render: jest.fn(),
    getContext: jest.fn(() => ({ isContextLost })),
    readRenderTargetPixels: jest.fn(),
  };
  return renderer;
};

const createBakeFixture = () => {
  const scene = new THREE.Scene();

  const light = new THREE.DirectionalLight('#ffffff', 2);
  light.position.set(40, 90, 40);
  light.castShadow = true;
  light.shadow.camera.left = -2;
  light.shadow.camera.right = 2;
  light.shadow.camera.top = 2;
  light.shadow.camera.bottom = -2;
  scene.add(light);

  const model = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial()
  );
  model.position.y = 0.5;
  scene.add(model);

  const liveCatcher = new THREE.Mesh(
    new THREE.CircleGeometry(5, 8),
    new THREE.ShadowMaterial()
  );
  liveCatcher.name = CONTACT_SHADOW_LIVE_NAME;
  scene.add(liveCatcher);

  return { scene, light, model, liveCatcher };
};

describe('ContactShadowBaker', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accumulates the configured number of jittered shadow passes', () => {
    const { scene, light, model } = createBakeFixture();
    const renderer = createMockRenderer();

    new ContactShadowBaker({ passes: 12 }).bake({
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: model,
      light,
    });

    expect(renderer.render).toHaveBeenCalledTimes(12);
  });

  it('installs a transparent baked mesh on the floor and hides the live catcher', () => {
    const { scene, light, model, liveCatcher } = createBakeFixture();
    const renderer = createMockRenderer();

    new ContactShadowBaker({ passes: 4 }).bake({
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: model,
      light,
    });

    const baked = scene.getObjectByName(CONTACT_SHADOW_BAKED_NAME) as THREE.Mesh;
    expect(baked).toBeDefined();
    expect(baked.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(baked.position.y).toBeGreaterThan(0);
    expect(baked.position.x).toBeCloseTo(model.position.x);
    expect(baked.position.z).toBeCloseTo(model.position.z);

    const material = baked.material as THREE.MeshBasicMaterial;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.toneMapped).toBe(false);
    expect(material.map).toBe(
      (baked.userData.renderTarget as THREE.WebGLRenderTarget).texture
    );

    expect(liveCatcher.visible).toBe(false);
  });

  it('returns the model to its original parent with colorWrite restored', () => {
    const { scene, light, model } = createBakeFixture();
    const renderer = createMockRenderer();

    new ContactShadowBaker({ passes: 4 }).bake({
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: model,
      light,
    });

    expect(model.parent).toBe(scene);
    expect((model.material as THREE.Material).colorWrite).toBe(true);
  });

  it('restores renderer state and never touches the real light', () => {
    const { scene, light, model } = createBakeFixture();
    const renderer = createMockRenderer();
    const originalPosition = light.position.clone();
    const originalRadius = light.shadow.radius;
    const originalMapSize = light.shadow.mapSize.clone();

    new ContactShadowBaker({ passes: 4 }).bake({
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: model,
      light,
    });

    expect(renderer.autoClear).toBe(true);
    expect(renderer.shadowMap.autoUpdate).toBe(true);
    const lastTargetCall =
      renderer.setRenderTarget.mock.calls[renderer.setRenderTarget.mock.calls.length - 1];
    expect(lastTargetCall[0]).toBeNull();
    const lastClearCall =
      renderer.setClearColor.mock.calls[renderer.setClearColor.mock.calls.length - 1];
    expect((lastClearCall[0] as THREE.Color).getHexString()).toBe('123456');
    expect(lastClearCall[1]).toBe(1);

    expect(light.position).toEqual(originalPosition);
    expect(light.shadow.radius).toBe(originalRadius);
    expect(light.shadow.mapSize).toEqual(originalMapSize);
  });

  it('re-baking replaces the previous mesh and frees its render target', () => {
    const { scene, light, model } = createBakeFixture();
    const renderer = createMockRenderer();
    const baker = new ContactShadowBaker({ passes: 4 });
    const context = {
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: model,
      light,
    };

    baker.bake(context);
    const first = scene.getObjectByName(CONTACT_SHADOW_BAKED_NAME) as THREE.Mesh;
    const firstTarget = first.userData.renderTarget as THREE.WebGLRenderTarget;
    const disposeSpy = jest.spyOn(firstTarget, 'dispose');

    baker.bake(context);

    const bakedMeshes = scene.children.filter(
      (child) => child.name === CONTACT_SHADOW_BAKED_NAME
    );
    expect(bakedMeshes).toHaveLength(1);
    expect(bakedMeshes[0]).not.toBe(first);
    expect(disposeSpy).toHaveBeenCalled();
  });

  it('disposing the baked material frees the render target', () => {
    const { scene, light, model } = createBakeFixture();
    const renderer = createMockRenderer();

    new ContactShadowBaker({ passes: 4 }).bake({
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: model,
      light,
    });

    const baked = scene.getObjectByName(CONTACT_SHADOW_BAKED_NAME) as THREE.Mesh;
    const target = baked.userData.renderTarget as THREE.WebGLRenderTarget;
    const disposeSpy = jest.spyOn(target, 'dispose');

    (baked.material as THREE.Material).dispose();

    expect(disposeSpy).toHaveBeenCalled();
  });

  it('clips the shadow disc to the floor coverage so it never overhangs the tiles', () => {
    const { scene, light, model, liveCatcher } = createBakeFixture();
    liveCatcher.geometry.dispose();
    liveCatcher.geometry = new THREE.CircleGeometry(0.5, 8);
    const renderer = createMockRenderer();

    new ContactShadowBaker({ passes: 4 }).bake({
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: model,
      light,
    });

    const baked = scene.getObjectByName(CONTACT_SHADOW_BAKED_NAME) as THREE.Mesh;
    const geometry = baked.geometry as THREE.CircleGeometry;
    expect(geometry.type).toBe('CircleGeometry');
    // The 1m box would otherwise get a ~2.6 half-extent — the 0.5 floor wins.
    expect(geometry.parameters.radius).toBe(0.5);
  });

  it('scales the pass count down to the floor when the probe pass is slow', () => {
    const { scene, light, model } = createBakeFixture();
    const renderer = createMockRenderer();
    // 10ms per pass against a 100ms budget wants 10 passes — clamped to the
    // 24-pass quality floor.
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(10);

    new ContactShadowBaker().bake({
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: model,
      light,
    });

    // 1 untimed warm-up + 1 timed probe + 24 budgeted passes.
    expect(renderer.render).toHaveBeenCalledTimes(26);
    // One sync fence after the warm-up (drains one-time upload/link costs
    // out of the timed window) and one after the probe.
    expect(renderer.readRenderTargetPixels).toHaveBeenCalledTimes(2);
    expect(scene.getObjectByName(CONTACT_SHADOW_BAKED_NAME)).toBeDefined();
  });

  it('keeps full quality when the probe pass is fast', () => {
    const { scene, light, model } = createBakeFixture();
    const renderer = createMockRenderer();
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5);

    new ContactShadowBaker().bake({
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: model,
      light,
    });

    // Warm-up + probe + the 96-pass ceiling.
    expect(renderer.render).toHaveBeenCalledTimes(98);
  });

  it('stays at full quality when the sync readback is unsupported', () => {
    const { scene, light, model } = createBakeFixture();
    const renderer = createMockRenderer();
    renderer.capabilities.textureTypeReadable.mockReturnValue(false);
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5);

    new ContactShadowBaker().bake({
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: model,
      light,
    });

    // No readback attempted (it would console-error, not throw), timing
    // degrades to submission cost → the full-quality ceiling.
    expect(renderer.readRenderTargetPixels).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledTimes(98);
    expect(scene.getObjectByName(CONTACT_SHADOW_BAKED_NAME)).toBeDefined();
  });

  it('evicts the stale baked disc when the context is already lost', () => {
    const { scene, light, model, liveCatcher } = createBakeFixture();
    // First bake succeeds; the second finds the context gone at entry.
    const isContextLost = jest
      .fn<boolean, []>()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const renderer = createMockRenderer(isContextLost);
    const baker = new ContactShadowBaker({ passes: 4 });
    const context = {
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: model,
      light,
    };

    baker.bake(context);
    expect(scene.getObjectByName(CONTACT_SHADOW_BAKED_NAME)).toBeDefined();
    expect(liveCatcher.visible).toBe(false);

    baker.bake(context);

    // The stale disc would come back as an opaque black blob once the
    // context is restored — the abort must hand back to the live catcher.
    expect(renderer.render).toHaveBeenCalledTimes(4);
    expect(scene.getObjectByName(CONTACT_SHADOW_BAKED_NAME)).toBeUndefined();
    expect(liveCatcher.visible).toBe(true);
  });

  it('aborts the install and revives the live catcher when the context is lost mid-bake', () => {
    const { scene, light, model, liveCatcher } = createBakeFixture();
    // First bake succeeds (entry + post checks), the second loses the
    // context between its entry check and the post-accumulation check.
    const isContextLost = jest
      .fn<boolean, []>()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const renderer = createMockRenderer(isContextLost);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const baker = new ContactShadowBaker({ passes: 4 });
    const context = {
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: model,
      light,
    };

    baker.bake(context);
    expect(liveCatcher.visible).toBe(false);

    baker.bake(context);

    // A partial accumulation must never replace the working live shadow,
    // and the previous (stale-pose) disc must not linger either.
    expect(scene.getObjectByName(CONTACT_SHADOW_BAKED_NAME)).toBeUndefined();
    expect(liveCatcher.visible).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/context was lost/));
  });

  it('aims the bake stand-in light where the real rig aims, not at the origin', () => {
    const { scene, light, model } = createBakeFixture();
    // The fitted rig aims at an off-origin model; the bake light must follow
    // or its shadow camera misses the model and the disc accumulates nothing.
    model.position.set(100, 1, -40);
    light.position.set(140, 91, 0);
    light.target.position.set(100, 1, -40);
    scene.add(light.target);
    const renderer = createMockRenderer();
    const capturedScenes: THREE.Scene[] = [];
    renderer.render.mockImplementation((bakeScene: THREE.Scene) => {
      capturedScenes.push(bakeScene);
    });

    new ContactShadowBaker({ passes: 2 }).bake({
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: model,
      light,
    });

    const bakeScene = capturedScenes[0];
    const bakeLight = bakeScene.children.find(
      (child): child is THREE.DirectionalLight =>
        child instanceof THREE.DirectionalLight
    );
    expect(bakeLight).toBeDefined();
    expect(bakeLight!.target.position.x).toBeCloseTo(100);
    expect(bakeLight!.target.position.y).toBeCloseTo(1);
    expect(bakeLight!.target.position.z).toBeCloseTo(-40);
  });

  it('does nothing for an object with an empty bounding box', () => {
    const { scene, light } = createBakeFixture();
    const renderer = createMockRenderer();
    const empty = new THREE.Group();
    scene.add(empty);

    new ContactShadowBaker({ passes: 4 }).bake({
      renderer: renderer as unknown as THREE.WebGLRenderer,
      scene,
      object: empty,
      light,
    });

    expect(renderer.render).not.toHaveBeenCalled();
    expect(scene.getObjectByName(CONTACT_SHADOW_BAKED_NAME)).toBeUndefined();
  });
});
