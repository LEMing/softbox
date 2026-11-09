import { ModelUnits } from '../../types/SimpleViewerOptions';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { UNITS_TO_METERS } from '../constants';

export function resolveUnitsScaleToMeters(units: ModelUnits | undefined): number {
  const resolved = units ?? 'meters';
  if (!Object.prototype.hasOwnProperty.call(UNITS_TO_METERS, resolved)) {
    throw new ThreeViewerError(
      `Unknown units '${String(resolved)}'. Valid values: ${Object.keys(UNITS_TO_METERS).join(', ')}`,
      ErrorCode.INVALID_PARAMETER
    );
  }
  return UNITS_TO_METERS[resolved];
}
