import { ModelUnits } from '../types/SimpleViewerOptions';

/**
 * Engine-agnostic viewer constants.
 */

/** Default number of path-tracing samples to accumulate before completion. */
export const DEFAULT_PATH_TRACING_SAMPLES = 300;

/** Factors converting authored model units to the viewer's 1-unit-=-1-meter convention. */
export const UNITS_TO_METERS: Record<ModelUnits, number> = {
  meters: 1,
  centimeters: 0.01,
  millimeters: 0.001,
  feet: 0.3048,
  inches: 0.0254,
};

/** Name of the group a model is wrapped in when converting non-meter units. */
export const UNITS_SCALE_WRAPPER_NAME = 'softbox-units-scale';
