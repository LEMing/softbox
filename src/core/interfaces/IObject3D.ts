import { Result } from '../../utils/Result';

/**
 * Core interface for 3D objects, independent of Three.js
 */
export interface IObject3D {
  id: string;
  name: string;
  visible: boolean;
  position: IVector3;
  rotation: IVector3;
  scale: IVector3;
  
  add(child: IObject3D): Result<void>;
  remove(child: IObject3D): Result<void>;
  traverse(callback: (object: IObject3D) => void): void;
  clone(): IObject3D;
  dispose(): void;
}

export interface IVector3 {
  x: number;
  y: number;
  z: number;
  
  set(x: number, y: number, z: number): void;
  copy(v: IVector3): void;
  add(v: IVector3): void;
  multiply(v: IVector3): void;
  normalize(): void;
  length(): number;
}

export interface IBoundingBox {
  min: IVector3;
  max: IVector3;
  
  setFromObject(object: IObject3D): void;
  getCenter(target: IVector3): void;
  getSize(target: IVector3): void;
  isEmpty(): boolean;
}