import { IFloorAlignmentService } from '../../core/services/IFloorAlignmentService';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';
import FloorAligner from './FloorAligner';
import * as THREE from 'three';

export class ThreeFloorAlignmentService implements IFloorAlignmentService {
  alignToFloor(object: THREE.Object3D): Result<void> {
    try {
      const aligner = new FloorAligner(object);
      aligner.alignToFloor();
      
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to align object to floor',
          ErrorCode.OPERATION_FAILED,
          { originalError: error }
        )
      );
    }
  }
}