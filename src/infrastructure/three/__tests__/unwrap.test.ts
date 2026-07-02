import * as THREE from 'three';
import {
  toThreeObject,
  toThreeCamera,
  toThreeScene,
  toThreeRenderer,
  toThreeControls,
} from '../unwrap';
import { ThreeObject3DAdapter } from '../ThreeObject3D';

describe('unwrap helpers', () => {
  it('unwraps adapters through their accessor', () => {
    const object = new THREE.Object3D();
    expect(toThreeObject(new ThreeObject3DAdapter(object))).toBe(object);

    const camera = new THREE.PerspectiveCamera();
    expect(toThreeCamera({ getThreeCamera: () => camera })).toBe(camera);

    const scene = new THREE.Scene();
    expect(toThreeScene({ getThreeScene: () => scene })).toBe(scene);

    const controls = { update: () => false };
    expect(toThreeControls({ getThreeControls: () => controls })).toBe(controls);
  });

  it('passes raw three objects through', () => {
    const object = new THREE.Object3D();
    expect(toThreeObject(object)).toBe(object);

    const camera = new THREE.OrthographicCamera();
    expect(toThreeCamera(camera)).toBe(camera);

    const scene = new THREE.Scene();
    expect(toThreeScene(scene)).toBe(scene);
  });

  it('returns null for anything else', () => {
    expect(toThreeObject(null)).toBeNull();
    expect(toThreeObject({})).toBeNull();
    expect(toThreeCamera(undefined)).toBeNull();
    expect(toThreeScene(42)).toBeNull();
    expect(toThreeRenderer({})).toBeNull();
    expect(toThreeControls({})).toBeNull();
  });

  it('preserves this for accessor-based adapters', () => {
    class Adapter {
      private readonly camera = new THREE.PerspectiveCamera();
      getThreeCamera() {
        return this.camera;
      }
    }
    const adapter = new Adapter();
    expect(toThreeCamera(adapter)).toBe(adapter.getThreeCamera());
  });
});
