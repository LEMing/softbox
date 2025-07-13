import * as THREE from 'three';

class FloorAligner {
  private object: THREE.Object3D;
  private boundingBox: THREE.Box3;

  constructor(object: THREE.Object3D) {
    this.object = object;
    this.boundingBox = new THREE.Box3().setFromObject(this.object);
  }

  alignToFloor(): void {
    const offset = this.calculateFloorOffset();
    this.applyOffset(offset);
  }

  private calculateFloorOffset(): THREE.Vector3 {
    const bottomY = this.boundingBox.min.y;
    const height = this.boundingBox.max.y - bottomY;

    const offset = new THREE.Vector3();

    if (height > 0) {
      // For non-flat objects, align the bottom to y=0
      offset.y = -bottomY;
    } else {
      // For flat objects, don't change the y position
      offset.y = 0;
    }

    return offset;
  }

  private applyOffset(offset: THREE.Vector3): void {
    this.object.position.add(offset);
  }
}

export default FloorAligner;
