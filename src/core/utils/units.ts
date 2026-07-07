import { ModelUnits } from '../../types/SimpleViewerOptions';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { UNITS_TO_METERS } from '../constants';

/**
 * Resolves a `units` option to its meters conversion factor.
 *
 * Throws `INVALID_PARAMETER` on unknown strings — reachable only from untyped
 * (JS) consumers, where a typo'd unit must not silently render at meter scale.
 * The own-property check keeps prototype-chain names ('toString', …) from
 * slipping past as unit values.
 */
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
