import { IObject3D } from '../interfaces/IObject3D';
import { Result } from '../../utils/Result';

export interface IFloorAlignmentService {
  alignToFloor(object: IObject3D): Result<void>;
}