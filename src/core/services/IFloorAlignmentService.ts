import { IObject3D } from '../interfaces/IObject3D';
import { Result } from '../../utils/Result';

/**
 * Service interface for aligning objects to floor
 */
export interface IFloorAlignmentService {
  /**
   * Align an object to the floor (y=0)
   */
  alignToFloor(object: IObject3D): Result<void>;
}