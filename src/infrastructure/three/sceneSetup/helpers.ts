import * as THREE from 'three';
import { IHelperOptions } from '../../../core/services/ISceneSetupService';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { GridFactory } from '../grids/GridFactory';
import { GridType, IGridOptions } from '../grids/IGridStyle';
import { SceneUserData } from './sceneUserData';

export function addHelpers(scene: THREE.Scene, options: IHelperOptions): Result<void> {
  try {
    if (options.grid) {
      const userData = scene.userData as SceneUserData;
      const gridConfig = typeof options.grid === 'object' ? options.grid : null;

      const gridOptions = {
        enabled: true,
        color: gridConfig?.colorGrid || options.gridColor || '#AAAAAA',
        type: gridConfig?.type ? (gridConfig.type as GridType) : GridType.HEXAGONAL_GLASS,
        opacity: gridConfig?.opacity,
        styleOptions: gridConfig?.styleOptions
      };

      scene.userData = {
        ...userData,
        gridOptions
      };

      if (gridConfig?.size || gridConfig?.divisions) {
        const gridType = gridOptions.type || GridType.HEXAGONAL_GLASS;
        const gridSize = gridConfig.size || 10;
        const divisions = gridConfig.divisions || 10;

        const gridOptionsForFactory: IGridOptions = {
          size: gridSize,
          divisions: divisions,
          color: gridOptions.color,
          opacity: gridOptions.opacity,
          styleOptions: {
            hexRadius: Math.floor(divisions / 2),
            tileSize: 1,
            ...gridOptions.styleOptions
          }
        };

        const grid = GridFactory.createGrid(gridType, gridOptionsForFactory);
        grid.userData.isGrid = true;
        grid.userData.isDefaultGrid = true;
        scene.add(grid);
      }
    }

    if (options.axes) {
      const size = options.axesSize || 5;
      const axesHelper = new THREE.AxesHelper(size);
      scene.add(axesHelper);
    }

    return Result.ok(undefined);
  } catch (error) {
    return Result.err(
      new ThreeViewerError(
        'Failed to add helpers to scene',
        ErrorCode.SCENE_OPERATION_FAILED,
        { originalError: error, options }
      )
    );
  }
}
