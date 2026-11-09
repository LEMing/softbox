import { GridType } from '../grids/IGridStyle';

export interface SceneUserData {
  gridOptions?: {
    enabled: boolean;
    color: string;
    type?: GridType;
    opacity?: number;
    styleOptions?: Record<string, unknown>;
  };
}
