import * as THREE from 'three';
import { ThreeObject3DAdapter } from '../ThreeObject3D';

describe('ThreeObject3DAdapter castShadow/receiveShadow', () => {
  it('proxies castShadow and receiveShadow to the underlying THREE.Object3D', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry());
    const adapter = new ThreeObject3DAdapter(mesh);

    expect(adapter.castShadow).toBe(false);
    expect(adapter.receiveShadow).toBe(false);

    adapter.castShadow = true;
    adapter.receiveShadow = true;

    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
  });

  it('is reachable via the generic IObject3D contract used by ModelManager to enable shadows', () => {
    // Regression test: model.traverse() used to hand callers a fresh
    // ThreeObject3DAdapter with no castShadow/receiveShadow at all, so
    // `'castShadow' in child` was always false and no model ever cast a
    // shadow. Traversing through the IObject3D interface must now work.
    const parent = new THREE.Group();
    const child = new THREE.Mesh(new THREE.BoxGeometry());
    parent.add(child);

    const adapter = new ThreeObject3DAdapter(parent);
    adapter.traverse((obj) => {
      if ('castShadow' in obj && 'receiveShadow' in obj) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    expect(parent.castShadow).toBe(true);
    expect(child.castShadow).toBe(true);
    expect(child.receiveShadow).toBe(true);
  });
});
