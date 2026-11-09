import * as THREE from 'three';

export class GroundedSkybox extends THREE.Mesh {
  constructor(map: THREE.Texture, height: number, radius: number) {
    super(
      new THREE.SphereGeometry(1, 8, 4),
      new THREE.MeshBasicMaterial({ map })
    );
    this.userData.__groundedSkyboxParams = { height, radius };
  }
}
