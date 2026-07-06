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
});
