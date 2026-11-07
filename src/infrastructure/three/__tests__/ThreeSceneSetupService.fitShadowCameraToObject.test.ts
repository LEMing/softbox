import * as THREE from 'three';
import { ThreeSceneSetupService } from '../ThreeSceneSetupService';
import { ThreeSceneAdapter } from '../ThreeScene';
import { ThreeObject3DAdapter } from '../ThreeObject3D';

describe('ThreeSceneSetupService.fitShadowCameraToObject', () => {
  it('shrinks the shadow camera frustum to fit a small object', () => {
    const threeScene = new THREE.Scene();
    const light = new THREE.DirectionalLight('#ffffff', 2);
    light.castShadow = true;
    light.shadow.camera.left = -50;
    light.shadow.camera.right = 50;
    light.shadow.camera.top = 50;
    light.shadow.camera.bottom = -50;
    threeScene.add(light);

    // A tiny 0.06m object (avocado-scale).
    const object = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06));
    threeScene.add(object);

    const service = new ThreeSceneSetupService();
    const result = service.fitShadowCameraToObject(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(object)
    );

    expect(result.ok).toBe(true);
    expect(light.shadow.camera.right).toBeLessThan(1);
    expect(light.shadow.camera.right).toBeGreaterThan(0);
    expect(light.shadow.camera.left).toBe(-light.shadow.camera.right);
    expect(light.shadow.camera.top).toBe(light.shadow.camera.right);
    expect(light.shadow.camera.bottom).toBe(-light.shadow.camera.right);
  });

  it('grows the shadow camera frustum to fit a large object', () => {
    const threeScene = new THREE.Scene();
    const light = new THREE.DirectionalLight('#ffffff', 2);
    light.castShadow = true;
    light.shadow.camera.left = -50;
    light.shadow.camera.right = 50;
    light.shadow.camera.top = 50;
    light.shadow.camera.bottom = -50;
    threeScene.add(light);

    // A large 200m object — bigger than the original fixed ±50 frustum.
    const object = new THREE.Mesh(new THREE.BoxGeometry(200, 10, 10));
    threeScene.add(object);

    const service = new ThreeSceneSetupService();
    const result = service.fitShadowCameraToObject(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(object)
    );

    expect(result.ok).toBe(true);
    expect(light.shadow.camera.right).toBeGreaterThan(50);
  });

  it('brackets the depth range around the object so the bias offset scales with it', () => {
    const threeScene = new THREE.Scene();
    const light = new THREE.DirectionalLight('#ffffff', 2);
    light.position.set(40, 90, 40);
    light.castShadow = true;
    // The configured fixed span: bias × (far − near) ≈ 2cm in world space at
    // ANY model size — which erases a 6cm object's entire contact shadow.
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 200;
    threeScene.add(light);
    threeScene.add(light.target);

    const object = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06));
    threeScene.add(object);

    const service = new ThreeSceneSetupService();
    const result = service.fitShadowCameraToObject(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(object)
    );

    expect(result.ok).toBe(true);
    const camera = light.shadow.camera;
    const lightDistance = light.position.distanceTo(light.target.position);
    // The span hugs the object (2 × the fitted half-extent), so the same
    // normalized bias now offsets by a model-proportional world distance.
    expect(camera.far - camera.near).toBeLessThan(1);
    expect(camera.near).toBeLessThan(lightDistance);
    expect(camera.far).toBeGreaterThan(lightDistance);
  });

  it('does nothing when there is no shadow-casting directional light', () => {
    const threeScene = new THREE.Scene();
    const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    threeScene.add(object);

    const service = new ThreeSceneSetupService();
    const result = service.fitShadowCameraToObject(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(object)
    );

    expect(result.ok).toBe(true);
  });

  it('leaves a non-shadow-casting directional light untouched', () => {
    const threeScene = new THREE.Scene();
    const light = new THREE.DirectionalLight('#ffffff', 2);
    light.castShadow = false;
    light.shadow.camera.left = -50;
    threeScene.add(light);

    const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    threeScene.add(object);

    const service = new ThreeSceneSetupService();
    const result = service.fitShadowCameraToObject(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(object)
    );

    expect(result.ok).toBe(true);
    expect(light.shadow.camera.left).toBe(-50);
  });

  it('re-aims the light rig at an off-origin model, preserving the light direction', () => {
    const threeScene = new THREE.Scene();
    const light = new THREE.DirectionalLight('#ffffff', 2);
    light.castShadow = true;
    light.position.set(6, 6, 6);
    threeScene.add(light);
    threeScene.add(light.target);

    // The frustum is centered on the light's position→target axis; with the
    // target left at the origin, a model out at x=100 falls entirely outside
    // it and casts nothing.
    const object = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    object.position.set(100, 1, -40);
    threeScene.add(object);

    const directionBefore = light.position.clone().sub(light.target.position);
    const service = new ThreeSceneSetupService();
    const result = service.fitShadowCameraToObject(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(object)
    );

    expect(result.ok).toBe(true);
    expect(light.target.position.x).toBeCloseTo(100);
    expect(light.target.position.y).toBeCloseTo(1);
    expect(light.target.position.z).toBeCloseTo(-40);
    const directionAfter = light.position.clone().sub(light.target.position);
    expect(directionAfter.x).toBeCloseTo(directionBefore.x);
    expect(directionAfter.y).toBeCloseTo(directionBefore.y);
    expect(directionAfter.z).toBeCloseTo(directionBefore.z);
  });

  it('never re-aims a light embedded in the loaded model (parent-space coordinates)', () => {
    const threeScene = new THREE.Scene();
    // A GLB-authored light arrives nested inside the model's own hierarchy,
    // with its target parented to the light (GLTFLoader punctual lights).
    const modelRoot = new THREE.Group();
    modelRoot.position.set(10, 0, 10);
    const embeddedLight = new THREE.DirectionalLight('#ffffff', 1);
    embeddedLight.castShadow = true;
    embeddedLight.position.set(0, 5, 0);
    embeddedLight.add(embeddedLight.target);
    embeddedLight.target.position.set(0, 0, -1);
    modelRoot.add(embeddedLight);
    threeScene.add(modelRoot);

    const object = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    object.position.set(100, 1, -40);
    threeScene.add(object);

    const result = new ThreeSceneSetupService().fitShadowCameraToObject(
      new ThreeSceneAdapter(threeScene),
      new ThreeObject3DAdapter(object)
    );

    expect(result.ok).toBe(true);
    // World-space centers written into parent-space coordinates would
    // scramble the author's lighting — position and target must not move.
    expect(embeddedLight.position.x).toBeCloseTo(0);
    expect(embeddedLight.position.y).toBeCloseTo(5);
    expect(embeddedLight.target.position.z).toBeCloseTo(-1);
    // The frustum fit itself still applies.
    expect(embeddedLight.shadow.camera.right).toBeGreaterThan(0);
  });

  it('re-aims without drift when the next model loads somewhere else', () => {
    const threeScene = new THREE.Scene();
    const light = new THREE.DirectionalLight('#ffffff', 2);
    light.castShadow = true;
    light.position.set(6, 6, 6);
    threeScene.add(light);
    threeScene.add(light.target);
    const directionBefore = light.position.clone().sub(light.target.position);
    const service = new ThreeSceneSetupService();

    const farModel = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    farModel.position.set(100, 1, -40);
    threeScene.add(farModel);
    service.fitShadowCameraToObject(new ThreeSceneAdapter(threeScene), new ThreeObject3DAdapter(farModel));
    threeScene.remove(farModel);

    const homeModel = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    homeModel.position.set(0, 1, 0);
    threeScene.add(homeModel);
    service.fitShadowCameraToObject(new ThreeSceneAdapter(threeScene), new ThreeObject3DAdapter(homeModel));

    expect(light.target.position.x).toBeCloseTo(0);
    expect(light.target.position.z).toBeCloseTo(0);
    const directionAfter = light.position.clone().sub(light.target.position);
    expect(directionAfter.x).toBeCloseTo(directionBefore.x);
    expect(directionAfter.y).toBeCloseTo(directionBefore.y);
    expect(directionAfter.z).toBeCloseTo(directionBefore.z);
  });
});
