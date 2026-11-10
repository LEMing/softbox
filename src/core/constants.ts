import { ModelUnits } from '../types/SimpleViewerOptions';

export const DEFAULT_PATH_TRACING_SAMPLES = 300;

export const UNITS_TO_METERS: Record<ModelUnits, number> = {
  meters: 1,
  centimeters: 0.01,
  millimeters: 0.001,
  feet: 0.3048,
  inches: 0.0254,
};

export const UNITS_SCALE_WRAPPER_NAME = 'softbox-units-scale';
