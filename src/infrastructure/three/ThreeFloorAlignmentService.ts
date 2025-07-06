import { IFloorAlignmentService } from '../../core/services/IFloorAlignmentService';
import { IObject3D } from '../../core/interfaces/IObject3D';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';
import FloorAligner from './FloorAligner';
import * as THREE from 'three';

export class ThreeFloorAlignmentService implements IFloorAlignmentService {
  alignToFloor(object: IObject3D): Result<void> {
    try {
      // Get the Three.js object
      let threeObject: THREE.Object3D | null = null;
      
      // Check if it has getThreeObject method
      if ('getThreeObject' in object && typeof object.getThreeObject === 'function') {
        threeObject = object.getThreeObject() as THREE.Object3D;
      } else if (object instanceof THREE.Object3D) {
        threeObject = object;
      }
      
      if (!threeObject) {
        return Result.err(
          new ThreeViewerError(
            'Could not get Three.js object for floor alignment',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }
      
      const aligner = new FloorAligner(threeObject);
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