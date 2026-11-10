import * as THREE from 'three';
import { IScene } from '../../../core/interfaces/IScene';
import { IObject3D } from '../../../core/interfaces/IObject3D';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { toThreeObject, toThreeScene } from '../unwrap';
import { CONTACT_SHADOW_LIVE_NAME, PATH_TRACING_FLOOR_FLAG } from '../ContactShadowBaker';
import { disposeObject3D } from '../disposal';
import { HexTileConfig } from '../HexTileConfig';
import { GridFactory } from '../grids/GridFactory';
import { GridType, IGridOptions } from '../grids/IGridStyle';
import { SceneUserData } from './sceneUserData';

export function addDynamicGrid(scene: IScene, object: IObject3D, scaleFactor: number = 1.2): Result<void> {
  try {
    const threeScene = toThreeScene(scene);
    if (!threeScene) {
      return Result.err(
        new ThreeViewerError(
          'Scene must be ThreeSceneAdapter',
          ErrorCode.INVALID_PARAMETER
        )
      );
    }

    const userData = threeScene.userData as SceneUserData;
    const gridOptions = userData?.gridOptions;

    if (!gridOptions?.enabled) {
      return Result.ok(undefined);
    }

    const existingGrids: THREE.Object3D[] = [];
    threeScene.traverse((child: THREE.Object3D) => {
      if (child.userData?.isGrid || child.userData?.isHexGrid || child.userData?.isDefaultGrid) {
        existingGrids.push(child);
      }
    });
    existingGrids.forEach(grid => {
      disposeObject3D(grid);
      threeScene.remove(grid);
    });

    const threeObject = toThreeObject(object);
    if (!threeObject) {
      return Result.err(
        new ThreeViewerError(
          'Object must expose a Three.js Object3D',
          ErrorCode.INVALID_PARAMETER
        )
      );
    }
    const box = new THREE.Box3().setFromObject(threeObject);
    const size = box.getSize(new THREE.Vector3());

    if (box.isEmpty() || !Number.isFinite(size.x) || !Number.isFinite(size.z)) {
      console.warn('Skipping dynamic grid: object has an empty or non-finite bounding box');
      return Result.ok(undefined);
    }

    const configuredTileSize = gridOptions.styleOptions?.tileSize;
    const tileSize = typeof configuredTileSize === 'number' ? configuredTileSize : 1;

    const gridSpacing = HexTileConfig.getGridSpacing(tileSize);
    const hexWidth = gridSpacing.width;

    const requiredWidth = Math.max(size.x, size.z) * scaleFactor + size.y;

    let gridRadius = requiredWidth <= hexWidth ? 0 : Math.ceil((requiredWidth / hexWidth - 1) / 2);

    const MAX_GRID_RADIUS = 60;
    if (gridRadius > MAX_GRID_RADIUS) {
      console.warn(
        `Dynamic grid would need ${gridRadius} rings to cover the object; capping at ${MAX_GRID_RADIUS}. ` +
        'The floor will not fully reach the configured coverage for this tileSize/object-size combination.'
      );
      gridRadius = MAX_GRID_RADIUS;
    }

    if (requiredWidth < hexWidth * 0.8) {
      gridRadius = 0;
    } else if (gridRadius < 3 && requiredWidth > hexWidth * 2) {
      gridRadius = 3;
    }


    const gridType = gridOptions.type || GridType.HEXAGONAL_GLASS;
    const gridSize = Math.max(size.x, size.z) * scaleFactor;

    const gridOptions2: IGridOptions = {
      size: gridSize,
      divisions: gridRadius * 2 + 1,
      color: gridOptions.color,
      opacity: gridOptions.opacity,
      styleOptions: {
        hexRadius: gridRadius,
        tileSize: tileSize,
        ...gridOptions.styleOptions
      }
    };

    const grid = GridFactory.createGrid(gridType, gridOptions2);
    grid.userData.isGrid = true;
    grid.userData.isHexGrid = true;

    const catcherLift = THREE.MathUtils.clamp(size.y * 0.0025, 0.0002, 0.002);
    const liveCatcher = grid.getObjectByName(CONTACT_SHADOW_LIVE_NAME);
    if (liveCatcher) {
      liveCatcher.position.y = catcherLift;
    }
    grid.traverse((child) => {
      if (child.userData?.[PATH_TRACING_FLOOR_FLAG]) {
        child.position.y = catcherLift;
      }
    });

    const gridCenter = box.getCenter(new THREE.Vector3());
    grid.position.set(gridCenter.x, 0, gridCenter.z);

    threeScene.add(grid);

    return Result.ok(undefined);
  } catch (error) {
    return Result.err(
      new ThreeViewerError(
        'Failed to add dynamic grid',
        ErrorCode.SCENE_OPERATION_FAILED,
        { originalError: error }
      )
    );
  }
}
