import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MapControls } from 'three/examples/jsm/controls/MapControls';
import {
  ISceneSetupService,
  IHelperOptions,
  ILightingOptions,
  IGradientOptions
} from '../../core/services/ISceneSetupService';
import { IScene } from '../../core/interfaces/IScene';
import { IObject3D } from '../../core/interfaces/IObject3D';
import { ICamera } from '../../core/interfaces/ICamera';
import { IControls } from '../../core/interfaces/IControls';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { ThreeSceneAdapter } from './ThreeScene';
import { ThreeObject3DAdapter } from './ThreeObject3D';
import { disposeObject3D } from './disposal';
import { ThreeCameraAdapter } from './ThreeCamera';
import { ThreeOrbitControlsAdapter, ThreeMapControlsAdapter } from './ThreeControls';
import { HexTileConfig } from './HexTileConfig';
import { GridFactory } from './grids/GridFactory';
import { GridType, IGridOptions } from './grids/IGridStyle';

// Type definitions for Three.js scene userData
interface SceneUserData {
  gridOptions?: {
    enabled: boolean;
    color: string;
    type?: GridType;
    opacity?: number;
    styleOptions?: Record<string, unknown>;
  };
}

export class ThreeSceneSetupService implements ISceneSetupService {
  addHelpers(scene: IScene, options: IHelperOptions): Result<void> {
    try {
      if (!(scene instanceof ThreeSceneAdapter)) {
        return Result.err(
          new ThreeViewerError(
            'Scene must be ThreeSceneAdapter',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      const threeScene = scene.getThreeScene();

      // Store grid options and optionally create default grid
      if (options.grid) {
        const userData = threeScene.userData as SceneUserData;
        const gridConfig = typeof options.grid === 'object' ? options.grid : null;

        const gridOptions = {
          enabled: true,
          color: gridConfig?.colorGrid || options.gridColor || '#AAAAAA',
          type: gridConfig?.type ? (gridConfig.type as GridType) : GridType.HEXAGONAL_GLASS,
          opacity: gridConfig?.opacity,
          styleOptions: gridConfig?.styleOptions
        };

        threeScene.userData = {
          ...userData,
          gridOptions
        };

        // Create default grid if requested
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
          threeScene.add(grid);
        }
      }

      // Add axes helper
      if (options.axes) {
        const size = options.axesSize || 5;
        const axesHelper = new THREE.AxesHelper(size);
        threeScene.add(axesHelper);
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

  addDynamicGrid(scene: IScene, object: IObject3D, scaleFactor: number = 1.2): Result<void> {
    try {
      if (!(scene instanceof ThreeSceneAdapter)) {
        return Result.err(
          new ThreeViewerError(
            'Scene must be ThreeSceneAdapter',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      const threeScene = scene.getThreeScene();
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
      let threeObject: THREE.Object3D;
      if (object instanceof ThreeObject3DAdapter) {
        threeObject = object.getThreeObject();
      } else if ('getThreeObject' in object && typeof object.getThreeObject === 'function') {
        threeObject = object.getThreeObject();
      } else {
        threeObject = object as unknown as THREE.Object3D;
      }
      const box = new THREE.Box3().setFromObject(threeObject);
      const size = box.getSize(new THREE.Vector3());

      // An empty or non-finite bounding box (degenerate / NaN model geometry)
      // would size the grid to Infinity/NaN. Skip the dynamic grid instead.
      if (box.isEmpty() || !Number.isFinite(size.x) || !Number.isFinite(size.z)) {
        console.warn('Skipping dynamic grid: object has an empty or non-finite bounding box');
        return Result.ok(undefined);
      }

      // For a regular hexagon: edge length = radius (center to vertex)
      // We want edge length = 1 unit
      const EDGE_LENGTH = 1;
      const tileSize = EDGE_LENGTH; // Direct edge length

      // Use centralized configuration for grid calculations
      const gridSpacing = HexTileConfig.getGridSpacing(tileSize);
      const hexWidth = gridSpacing.width;

      // Calculate required grid radius (number of hex rings from center)
      const requiredWidth = Math.max(size.x, size.z) * scaleFactor;

      // Calculate how many rings we need
      // Each ring adds approximately its radius * hexWidth to coverage
      let gridRadius = 0;
      let currentCoverage = hexWidth; // Start with single hex

      while (currentCoverage < requiredWidth && gridRadius < 20) {
        gridRadius++;
        currentCoverage += 2 * hexWidth; // Each ring adds roughly 2 hex widths
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

  addLighting(scene: IScene, options: ILightingOptions): Result<void> {
    try {
      if (!(scene instanceof ThreeSceneAdapter)) {
        return Result.err(
          new ThreeViewerError(
            'Scene must be ThreeSceneAdapter',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      const threeScene = scene.getThreeScene();

      // Add ambient light
      if (options.ambient) {
        const color = new THREE.Color(options.ambient.color || '#404040');
        const intensity = options.ambient.intensity ?? Math.PI;
        const ambientLight = new THREE.AmbientLight(color, intensity);
        threeScene.add(ambientLight);
      }

      // Add hemisphere light
      if (options.hemisphere) {
        const skyColor = new THREE.Color(options.hemisphere.skyColor || '#ffffbb');
        const groundColor = new THREE.Color(options.hemisphere.groundColor || '#080820');
        const intensity = options.hemisphere.intensity ?? 1;
        const hemisphereLight = new THREE.HemisphereLight(skyColor, groundColor, intensity);
        threeScene.add(hemisphereLight);
      }

      // Add directional light
      if (options.directional) {
        const color = new THREE.Color(options.directional.color || '#ffffff');
        const intensity = options.directional.intensity ?? Math.PI;
        const directionalLight = new THREE.DirectionalLight(color, intensity);

        // Set position
        if (options.directional.position) {
          const pos = options.directional.position;
          // Handle both Vector3 objects and arrays
          if (pos instanceof THREE.Vector3) {
            directionalLight.position.copy(pos);
          } else if (Array.isArray(pos)) {
            directionalLight.position.set(pos[0], pos[1], pos[2]);
          } else if (typeof pos === 'object' && 'x' in pos && 'y' in pos && 'z' in pos) {
            const position = pos as { x: number; y: number; z: number };
            directionalLight.position.set(position.x, position.y, position.z);
          }
        } else {
          directionalLight.position.set(6, 6, 6);
        }

        // Configure shadows
        if (options.directional.castShadow) {
          directionalLight.castShadow = true;

          if (options.directional.shadow) {
            const shadow = options.directional.shadow;

            if (shadow.mapSize) {
              directionalLight.shadow.mapSize.width = shadow.mapSize.width;
              directionalLight.shadow.mapSize.height = shadow.mapSize.height;
            }

            if (shadow.camera) {
              const cam = directionalLight.shadow.camera;
              if (shadow.camera.near !== undefined) cam.near = shadow.camera.near;
              if (shadow.camera.far !== undefined) cam.far = shadow.camera.far;
              if (shadow.camera.left !== undefined) cam.left = shadow.camera.left;
              if (shadow.camera.right !== undefined) cam.right = shadow.camera.right;
              if (shadow.camera.top !== undefined) cam.top = shadow.camera.top;
              if (shadow.camera.bottom !== undefined) cam.bottom = shadow.camera.bottom;
            }

            if (shadow.bias !== undefined) {
              directionalLight.shadow.bias = shadow.bias;
            }

            if (shadow.radius !== undefined) {
              directionalLight.shadow.radius = shadow.radius;
            }
          }
        }

        // Make the light look at the center
        directionalLight.target.position.set(0, 0, 0);
        threeScene.add(directionalLight);
        threeScene.add(directionalLight.target);

        // Update shadow camera
        if (directionalLight.shadow) {
          directionalLight.shadow.camera.updateProjectionMatrix();
        }
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to add lighting to scene',
          ErrorCode.SCENE_OPERATION_FAILED,
          { originalError: error, options }
        )
      );
    }
  }

  createGradientBackground(scene: IScene, options: IGradientOptions): Result<void> {
    try {
      if (!(scene instanceof ThreeSceneAdapter)) {
        return Result.err(
          new ThreeViewerError(
            'Scene must be ThreeSceneAdapter',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      const threeScene = scene.getThreeScene();

      // Create gradient shader
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 512;

      const context = canvas.getContext('2d');
      if (!context) {
        return Result.err(
          new ThreeViewerError(
            'Failed to create canvas context',
            ErrorCode.SCENE_OPERATION_FAILED
          )
        );
      }

      // Create gradient
      const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, options.topColor);
      gradient.addColorStop(1, options.bottomColor);

      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Create texture from canvas
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;

      // Apply as background, disposing any previous background texture so that
      // repeated calls (e.g. runtime background-color changes) do not leak.
      // Guard against disposing a texture that is still in use as the scene
      // environment (studio mode shares one PMREM texture for both).
      const previous = threeScene.background;
      if (previous instanceof THREE.Texture && previous !== threeScene.environment) {
        previous.dispose();
      }
      threeScene.background = texture;

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to create gradient background',
          ErrorCode.SCENE_OPERATION_FAILED,
          { originalError: error, options }
        )
      );
    }
  }

  fitCameraToObject(object: IObject3D, camera: ICamera, controls: IControls): Result<void> {
    try {
      // Get the actual Three.js object
      let threeObject: THREE.Object3D;
      if (object instanceof ThreeObject3DAdapter) {
        threeObject = object.getThreeObject();
      } else if ('getThreeObject' in object && typeof object.getThreeObject === 'function') {
        threeObject = object.getThreeObject();
      } else {
        threeObject = object as unknown as THREE.Object3D;
      }

      // Get the actual Three.js camera
      let threeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
      if (camera instanceof ThreeCameraAdapter) {
        threeCamera = camera.getThreeCamera() as THREE.PerspectiveCamera | THREE.OrthographicCamera;
      } else if ('getThreeCamera' in camera && typeof camera.getThreeCamera === 'function') {
        threeCamera = camera.getThreeCamera() as THREE.PerspectiveCamera | THREE.OrthographicCamera;
      } else {
        threeCamera = camera as unknown as THREE.PerspectiveCamera | THREE.OrthographicCamera;
      }

      // Get the actual Three.js controls
      let threeControls: OrbitControls | MapControls;
      if (controls instanceof ThreeOrbitControlsAdapter || controls instanceof ThreeMapControlsAdapter) {
        threeControls = controls.getThreeControls();
      } else if ('getThreeControls' in controls && typeof controls.getThreeControls === 'function') {
        threeControls = controls.getThreeControls();
      } else {
        threeControls = controls as unknown as OrbitControls | MapControls;
      }

      // Calculate bounding box
      const box = new THREE.Box3().setFromObject(threeObject);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());


      // Get the max dimension
      const maxDim = Math.max(size.x, size.y, size.z);

      // Check if it's a perspective camera and get FOV
      let fov: number;
      if ('fov' in threeCamera) {
        fov = threeCamera.fov * (Math.PI / 180);
      } else {
        // For orthographic camera, use a default FOV equivalent
        fov = 50 * (Math.PI / 180);
      }

      // Calculate distance needed to fit object in view
      let distance = Math.abs(maxDim / 2 / Math.tan(fov / 2));

      // Add padding (100% extra space for better view)
      distance *= 2.0;

      // Left-front view at eye level
      // Angle: -45 degrees (315 degrees) for left-front
      const angle = -Math.PI / 4; // -45 degrees (left-front)
      const elevation = Math.PI / 8; // 22.5 degrees up (more eye level)

      // Calculate camera position at the desired distance
      const cameraX = center.x + distance * Math.sin(angle) * Math.cos(elevation);
      const cameraY = center.y + distance * Math.sin(elevation);
      const cameraZ = center.z + distance * Math.cos(angle) * Math.cos(elevation);

      // Update camera
      threeCamera.position.set(cameraX, cameraY, cameraZ);
      threeCamera.lookAt(center);
      threeCamera.updateProjectionMatrix();

      // Update controls target to look at object center
      if (threeControls && threeControls.target) {
        threeControls.target.copy(center);
        threeControls.update();
      }


      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to fit camera to object',
          ErrorCode.CAMERA_INIT_FAILED,
          { originalError: error }
        )
      );
    }
  }
}
