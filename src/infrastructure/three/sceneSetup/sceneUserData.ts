import { GridType } from '../grids/IGridStyle';

// Type definitions for Three.js scene userData
export interface SceneUserData {
  gridOptions?: {
    enabled: boolean;
    color: string;
    type?: GridType;
    opacity?: number;
    styleOptions?: Record<string, unknown>;
  };
}
