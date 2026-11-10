export type StudioLook = 'crisp' | 'soft';

export const DEFAULT_STUDIO_LOOK: StudioLook = 'crisp';

export interface EnvironmentOptions {
  url?: string;
  backgroundBlurriness?: number;
  backgroundIntensity?: number;
  environmentIntensity?: number;
  studioLook?: StudioLook;
  groundProjection?: boolean | { height?: number; radius?: number };
}
