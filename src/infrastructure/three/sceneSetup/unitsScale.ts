import * as THREE from 'three';
import { IObject3D } from '../../../core/interfaces/IObject3D';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { toThreeObject } from '../unwrap';
import { ThreeObject3DAdapter } from '../ThreeObject3D';
import { UNITS_SCALE_WRAPPER_NAME } from '../../../core/constants';

export function wrapInUnitsScaleGroup(object: IObject3D, scaleToMeters: number): Result<IObject3D> {
  try {
    const threeObject = toThreeObject(object);
    if (!threeObject) {
      return Result.err(
        new ThreeViewerError(
          'Object must expose a Three.js Object3D',
          ErrorCode.INVALID_PARAMETER
        )
      );
    }

    const wrapper = new THREE.Group();
    wrapper.name = UNITS_SCALE_WRAPPER_NAME;
    wrapper.scale.setScalar(scaleToMeters);
    wrapper.add(threeObject);
    return Result.ok(new ThreeObject3DAdapter(wrapper));
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
