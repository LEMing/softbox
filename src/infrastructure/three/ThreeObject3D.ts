import * as THREE from 'three';
import { IObject3D, IVector3 } from '../../core/interfaces/IObject3D';
import { Result } from '../../utils/Result';
import { ThreeVector3Adapter } from './ThreeVector3';
import { disposeObject3D } from './disposal';
import { ThreeViewerError, ErrorCode } from '../../errors';

/**
 * Adapter for Three.js Object3D to implement IObject3D
 */
export class ThreeObject3DAdapter implements IObject3D {
  private readonly positionAdapter: ThreeVector3Adapter;
  private readonly rotationAdapter: ThreeVector3Adapter;
  private readonly scaleAdapter: ThreeVector3Adapter;

  constructor(private object: THREE.Object3D) {
    this.positionAdapter = ThreeVector3Adapter.fromThreeVector(object.position);
    // THREE.Euler has x, y, z properties similar to Vector3, so we can use a type assertion
    this.rotationAdapter = ThreeVector3Adapter.fromThreeVector(object.rotation as unknown as THREE.Vector3);
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