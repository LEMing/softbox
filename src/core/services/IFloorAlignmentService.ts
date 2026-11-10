import type * as THREE from 'three';
import { Result } from '../../utils/Result';

export interface IFloorAlignmentService {
  alignToFloor(object: THREE.Object3D): Result<void>;
}