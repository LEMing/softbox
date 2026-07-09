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

    // Remove existing grid if any (including default grids)
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

    // Calculate bounding box of the object
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

    // An empty or non-finite bounding box (degenerate / NaN model geometry)
    // would size the grid to Infinity/NaN. Skip the dynamic grid instead.
    if (box.isEmpty() || !Number.isFinite(size.x) || !Number.isFinite(size.z)) {
      console.warn('Skipping dynamic grid: object has an empty or non-finite bounding box');
      return Result.ok(undefined);
    }

    // For a regular hexagon: edge length = radius (center to vertex).
    // Configurable via styleOptions.tileSize so the ring-count math below
    // scales to the actual tile size — a fixed 1-unit assumption here would
    // under-cover the floor once tiles are configured smaller than that.
    // Deliberately NOT scaled to the object's own size: a real-world tile
    // (e.g. a sidewalk paver) is a fixed physical reference, like a ruler —
    // a small object correctly looks small next to it, the same way it
    // would sitting on an actual sidewalk.
    const configuredTileSize = gridOptions.styleOptions?.tileSize;
    const tileSize = typeof configuredTileSize === 'number' ? configuredTileSize : 1;

    // Use centralized configuration for grid calculations
    const gridSpacing = HexTileConfig.getGridSpacing(tileSize);
    const hexWidth = gridSpacing.width;

    // Calculate required grid radius (number of hex rings from center).
    // The height term buys floor for the cast shadow: with the steep key
    // light it stretches sideways by roughly the object's height, and a
    // shadow reaching past the last tile has nothing to fall on — it reads
    // as a smudge floating in mid-air next to the floor's edge.
    const requiredWidth = Math.max(size.x, size.z) * scaleFactor + size.y;

    // Solve directly for the ring count instead of an open-coded loop with
    // an arbitrary cap: coverage(n) = hexWidth * (1 + 2n), so n = the
    // smallest ring count whose coverage reaches requiredWidth. A capped
    // loop previously under-covered the floor for small tileSize values
    // (many more rings needed for the same physical radius), leaving a
    // visible gap between the model and the floor's edge from some angles.
    let gridRadius = requiredWidth <= hexWidth ? 0 : Math.ceil((requiredWidth / hexWidth - 1) / 2);

    // Safety net against pathological configs (e.g. a near-zero tileSize)
    // spawning an unbounded number of tiles — warn rather than silently
    // truncating, since a silent cap is exactly what caused the bug above.
    const MAX_GRID_RADIUS = 60;
    if (gridRadius > MAX_GRID_RADIUS) {
      console.warn(
        `Dynamic grid would need ${gridRadius} rings to cover the object; capping at ${MAX_GRID_RADIUS}. ` +
        'The floor will not fully reach the configured coverage for this tileSize/object-size combination.'
      );
      gridRadius = MAX_GRID_RADIUS;
    }

    // Ensure minimum based on object size
    if (requiredWidth < hexWidth * 0.8) {
      // Very small object - single tile
      gridRadius = 0;
    } else if (gridRadius < 3 && requiredWidth > hexWidth * 2) {
      // Medium object - at least 3 rings
      gridRadius = 3;
    }


    // Create grid using the factory based on type
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
    grid.userData.isHexGrid = true; // For backward compatibility

    // The catcher's default lift above the tile tops is sized for
    // car-scale models; over a centimeter-scale object the same fixed lift
    // covers a visible slice of the model's base, so scale it down with
    // the object (mirrors the baked contact shadow's own offset rule). The
    // tracer-only floor (shadow_floor) rides at the same height, so the model —
    // floor-snapped to the tallest grid surface — sits flush on it in the
    // traced view instead of hovering a hair above a fixed-height plane.
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

    // Center the floor under the model, not at the origin: an off-origin
    // model would otherwise stand beside its own floor (and shadow disc).
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
