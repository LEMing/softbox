import * as THREE from 'three';

/** Geometry stands in for the real projected sphere; the params are stashed
 * so tests can assert what the skybox was built with. */
export class GroundedSkybox extends THREE.Mesh {
  constructor(map: THREE.Texture, height: number, radius: number) {
    super(
      new THREE.SphereGeometry(1, 8, 4),
      new THREE.MeshBasicMaterial({ map })
    );
    this.userData.__groundedSkyboxParams = { height, radius };
  }
}
