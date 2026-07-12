import * as THREE from 'three';
import { IObject3D, IVector3 } from '../../core/interfaces/IObject3D';
import { Result } from '../../utils/Result';
import { ThreeVector3Adapter } from './ThreeVector3';
import { disposeObject3D } from './disposal';
import { ThreeViewerError, ErrorCode } from '../../errors';

/**
 * IVector3 view over a THREE.Euler. The rotation shares IVector3 with
 * position/scale on the engine-agnostic surface, but an Euler is NOT a
 * Vector3 — the previous double cast made `normalize()`/`length()` crash on
 * the missing methods. Component reads/writes map 1:1 to the live Euler; the
 * vector-space operations act on the raw component triple.
 */
class ThreeEulerAdapter implements IVector3 {
  constructor(private readonly euler: THREE.Euler) {}

  get x(): number {
    return this.euler.x;
  }
  set x(value: number) {
    this.euler.x = value;
  }
  get y(): number {
    return this.euler.y;
  }
  set y(value: number) {
    this.euler.y = value;
  }
  get z(): number {
    return this.euler.z;
  }
  set z(value: number) {
    this.euler.z = value;
  }

  set(x: number, y: number, z: number): void {
    this.euler.set(x, y, z);
  }

  copy(v: IVector3): void {
    this.euler.set(v.x, v.y, v.z);
  }

  add(v: IVector3): void {
    this.euler.set(this.euler.x + v.x, this.euler.y + v.y, this.euler.z + v.z);
  }

  multiply(v: IVector3): void {
    this.euler.set(this.euler.x * v.x, this.euler.y * v.y, this.euler.z * v.z);
  }

  normalize(): void {
    const magnitude = this.length();
    if (magnitude > 0) {
      this.euler.set(this.euler.x / magnitude, this.euler.y / magnitude, this.euler.z / magnitude);
    }
  }

  length(): number {
    return Math.hypot(this.euler.x, this.euler.y, this.euler.z);
  }
}

/**
 * Adapter for Three.js Object3D to implement IObject3D
 */
export class ThreeObject3DAdapter implements IObject3D {
  private readonly positionAdapter: ThreeVector3Adapter;
  private readonly rotationAdapter: ThreeEulerAdapter;
  private readonly scaleAdapter: ThreeVector3Adapter;

  constructor(private object: THREE.Object3D) {
    this.positionAdapter = ThreeVector3Adapter.fromThreeVector(object.position);
    this.rotationAdapter = new ThreeEulerAdapter(object.rotation);
    this.scaleAdapter = ThreeVector3Adapter.fromThreeVector(object.scale);
  }

  get id(): string {
    return this.object.uuid;
  }

  get name(): string {
    return this.object.name;
  }

  set name(value: string) {
    this.object.name = value;
  }

  get visible(): boolean {
    return this.object.visible;
  }

  set visible(value: boolean) {
    this.object.visible = value;
  }

  get castShadow(): boolean {
    return this.object.castShadow;
  }

  set castShadow(value: boolean) {
    this.object.castShadow = value;
  }

  get receiveShadow(): boolean {
    return this.object.receiveShadow;
  }

  set receiveShadow(value: boolean) {
    this.object.receiveShadow = value;
  }

  get position(): IVector3 {
    return this.positionAdapter;
  }

  get rotation(): IVector3 {
    return this.rotationAdapter;
  }

  get scale(): IVector3 {
    return this.scaleAdapter;
  }

  add(child: IObject3D): Result<void> {
    try {
      if (child instanceof ThreeObject3DAdapter) {
        this.object.add(child.getThreeObject());
        return Result.ok(undefined);
      }
      return Result.err(
        new ThreeViewerError(
          'Child must be a ThreeObject3DAdapter',
          ErrorCode.INVALID_PARAMETER
        )
      );
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to add child object',
          ErrorCode.SCENE_OPERATION_FAILED,
          { originalError: error }
        )
      );
    }
  }

  remove(child: IObject3D): Result<void> {
    try {
      if (child instanceof ThreeObject3DAdapter) {
        this.object.remove(child.getThreeObject());
        return Result.ok(undefined);
      }
      return Result.err(
        new ThreeViewerError(
          'Child must be a ThreeObject3DAdapter',
          ErrorCode.INVALID_PARAMETER
        )
      );
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to remove child object',
          ErrorCode.SCENE_OPERATION_FAILED,
          { originalError: error }
        )
      );
    }
  }

  traverse(callback: (object: IObject3D) => void): void {
    this.object.traverse((obj) => {
      callback(new ThreeObject3DAdapter(obj));
    });
  }

  clone(): IObject3D {
    return new ThreeObject3DAdapter(this.object.clone());
  }

  dispose(): void {
    disposeObject3D(this.object);
  }

  // Get the underlying Three.js object
  getThreeObject(): THREE.Object3D {
    return this.object;
  }

  // Static factory methods
  static fromThreeObject(object: THREE.Object3D): ThreeObject3DAdapter {
    return new ThreeObject3DAdapter(object);
  }

  static create(): ThreeObject3DAdapter {
    return new ThreeObject3DAdapter(new THREE.Object3D());
  }
}