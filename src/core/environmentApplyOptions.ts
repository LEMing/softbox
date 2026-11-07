import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { IEnvironmentApplyOptions } from './services/IEnvironmentService';
import { resolveGroundProjection } from './groundProjection';

/**
 * The environment apply-options block, assembled in ONE place. It used to be
 * hand-copied between the construction path (SceneConfigurator) and the
 * runtime env-swap path (EnvironmentController) — and a drifting copy
 * already silently stripped the ground projection once.
 */
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
