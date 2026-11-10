import * as THREE from 'three';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { UNITS_SCALE_WRAPPER_NAME } from '../../../core/constants';

export function wrapInUnitsScaleGroup(object: THREE.Object3D, scaleToMeters: number): Result<THREE.Object3D> {
  try {
    const wrapper = new THREE.Group();
    wrapper.name = UNITS_SCALE_WRAPPER_NAME;
    wrapper.scale.setScalar(scaleToMeters);
    wrapper.add(object);
    return Result.ok(wrapper);
  } catch (error) {
    return Result.err(
      new ThreeViewerError(
        'Failed to apply the units scale to the model',
        ErrorCode.SCENE_OPERATION_FAILED,
        { originalError: error }
      )
    );
  }
}
