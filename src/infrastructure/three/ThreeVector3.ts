import * as THREE from 'three';
import { IVector3 } from '../../core/interfaces/IObject3D';

export class ThreeVector3Adapter implements IVector3 {
  constructor(private vector: THREE.Vector3) {}

  get x(): number {
    return this.vector.x;
  }

  set x(value: number) {
    this.vector.x = value;
  }

  get y(): number {
    return this.vector.y;
  }

  set y(value: number) {
    this.vector.y = value;
  }

  get z(): number {
    return this.vector.z;
  }

  set z(value: number) {
    this.vector.z = value;
  }

  set(x: number, y: number, z: number): void {
    this.vector.set(x, y, z);
  }

  copy(v: IVector3): void {
    this.vector.set(v.x, v.y, v.z);
  }

  add(v: IVector3): void {
    this.vector.x += v.x;
    this.vector.y += v.y;
    this.vector.z += v.z;
  }

  multiply(v: IVector3): void {
    this.vector.x *= v.x;
    this.vector.y *= v.y;
    this.vector.z *= v.z;
  }

  normalize(): void {
    this.vector.normalize();
  }

  length(): number {
    return this.vector.length();
  }

  getThreeVector(): THREE.Vector3 {
    return this.vector;
  }

  static fromThreeVector(vector: THREE.Vector3): ThreeVector3Adapter {
    return new ThreeVector3Adapter(vector);
  }

  static create(x: number = 0, y: number = 0, z: number = 0): ThreeVector3Adapter {
    return new ThreeVector3Adapter(new THREE.Vector3(x, y, z));
  }
}