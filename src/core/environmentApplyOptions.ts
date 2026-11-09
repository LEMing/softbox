import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { IEnvironmentApplyOptions } from './services/IEnvironmentService';
import { resolveGroundProjection } from './groundProjection';

export function environmentApplyOptions(
  options: SimpleViewerOptions
): Omit<IEnvironmentApplyOptions, 'setBackground'> {
  return {
    backgroundBlurriness: options.environment?.backgroundBlurriness,
    backgroundIntensity: options.environment?.backgroundIntensity,
    environmentIntensity: options.environment?.environmentIntensity,
    groundProjection: resolveGroundProjection(options.environment?.groundProjection),
  };
}
