import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MapControls } from 'three/examples/jsm/controls/MapControls';
import {
  ISceneSetupService,
  IHelperOptions,
  ILightingOptions,
  IGradientOptions,
  ContactShadowMode
} from '../../core/services/ISceneSetupService';
import { IScene } from '../../core/interfaces/IScene';
import { IObject3D } from '../../core/interfaces/IObject3D';
import { ICamera } from '../../core/interfaces/ICamera';
import { IControls } from '../../core/interfaces/IControls';
import { IRenderer } from '../../core/interfaces/IRenderer';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { ThreeSceneAdapter } from './ThreeScene';
import { ThreeObject3DAdapter } from './ThreeObject3D';
import {
  toThreeCamera,
  toThreeControls,
  toThreeObject,
  toThreeRenderer,
  toThreeScene
} from './unwrap';
import {
  ContactShadowBaker,
  CONTACT_SHADOW_BAKED_NAME,
  CONTACT_SHADOW_LIVE_NAME
} from './ContactShadowBaker';
import { UNITS_SCALE_WRAPPER_NAME } from '../../core/constants';
import { disposeObject3D } from './disposal';
import { HexTileConfig } from './HexTileConfig';
import { GridFactory } from './grids/GridFactory';
import { GridType, IGridOptions } from './grids/IGridStyle';

const findDirectionalLight = (root: THREE.Object3D): THREE.DirectionalLight | null => {
  let found: THREE.DirectionalLight | null = null;
  root.traverse((child) => {
    if (!found && (child as THREE.DirectionalLight).isDirectionalLight) {
      found = child as THREE.DirectionalLight;
    }
  });
  return found;
};

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
  private readonly contactShadowBaker = new ContactShadowBaker();

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
      // the object (mirrors the baked contact shadow's own offset rule).
      const liveCatcher = grid.getObjectByName(CONTACT_SHADOW_LIVE_NAME);
      if (liveCatcher) {
        liveCatcher.position.y = THREE.MathUtils.clamp(size.y * 0.0025, 0.0002, 0.002);
      }

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

  snapObjectToFloor(scene: IScene, object: IObject3D): Result<void> {
    try {
      if (!(scene instanceof ThreeSceneAdapter)) {
        return Result.err(
          new ThreeViewerError(
            'Scene must be ThreeSceneAdapter',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      let threeObject: THREE.Object3D;
      if (object instanceof ThreeObject3DAdapter) {
        threeObject = object.getThreeObject();
      } else if ('getThreeObject' in object && typeof object.getThreeObject === 'function') {
        threeObject = object.getThreeObject();
      } else {
        threeObject = object as unknown as THREE.Object3D;
      }

      const isGridTagged = (obj: THREE.Object3D): boolean => {
        let current: THREE.Object3D | null = obj;
        while (current) {
          if (current.userData?.isGrid || current.userData?.isHexGrid || current.userData?.isDefaultGrid) {
            return true;
          }
          current = current.parent;
        }
        return false;
      };

      const threeScene = scene.getThreeScene();
      // The grid isn't the object being aligned, so nothing else guarantees
      // its matrixWorld is current — a stale (e.g. identity) transform would
      // silently throw the raycast hits off by whatever offset it's missing.
      threeScene.updateMatrixWorld(true);
      const gridMeshes: THREE.Mesh[] = [];
      threeScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && isGridTagged(child)) {
          gridMeshes.push(child as THREE.Mesh);
        }
      });

      const objectMeshes: THREE.Mesh[] = [];
      threeObject.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          objectMeshes.push(child as THREE.Mesh);
        }
      });

      if (gridMeshes.length === 0 || objectMeshes.length === 0) {
        // No floor to drop onto (or nothing to drop) — leave the object where it is.
        return Result.ok(undefined);
      }

      // The floor's height only needs measuring once — every tile sits at
      // the same Y by construction — rather than raycasting against
      // potentially thousands of individual tiles on every sample below.
      let floorTopY = -Infinity;
      const tileBox = new THREE.Box3();
      for (const mesh of gridMeshes) {
        tileBox.setFromObject(mesh);
        if (Number.isFinite(tileBox.max.y)) {
          floorTopY = Math.max(floorTopY, tileBox.max.y);
        }
      }
      if (!Number.isFinite(floorTopY)) {
        return Result.ok(undefined);
      }

      const box = new THREE.Box3().setFromObject(threeObject);
      if (box.isEmpty() || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
        return Result.ok(undefined);
      }

      // Sample a dense grid of vertical rays across the object's own
      // footprint, raycasting only against its own (typically BVH-
      // accelerated) meshes — a coarse grid or a single center ray can
      // straddle a narrow true contact point (e.g. a wheel's tread) and
      // under-shoot how far the object actually needs to drop.
      //
      // Each sample casts in BOTH directions: glTF materials default to
      // single-sided, so the true contact surface — its normal facing DOWN,
      // outward — is backface-culled for a ray from above and only hittable
      // from below. Down-rays still catch up-facing bottom surfaces (ground
      // decals, open shells); the object's lowest point is the minimum over
      // both passes.
      const SAMPLES_PER_AXIS = 40;
      const margin = Math.max(1, box.max.y - box.min.y);
      const aboveY = box.max.y + margin;
      const belowY = box.min.y - margin;
      const raycaster = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);
      const up = new THREE.Vector3(0, 1, 0);

      let lowestObjectY = Infinity;
      const recordLowestHit = (originX: number, originY: number, originZ: number, direction: THREE.Vector3) => {
        raycaster.set(new THREE.Vector3(originX, originY, originZ), direction);
        for (const hit of raycaster.intersectObjects(objectMeshes, false)) {
          if (hit.point.y < lowestObjectY) {
            lowestObjectY = hit.point.y;
          }
        }
      };

      for (let i = 0; i <= SAMPLES_PER_AXIS; i++) {
        for (let j = 0; j <= SAMPLES_PER_AXIS; j++) {
          const x = box.min.x + (box.max.x - box.min.x) * (i / SAMPLES_PER_AXIS);
          const z = box.min.z + (box.max.z - box.min.z) * (j / SAMPLES_PER_AXIS);
          recordLowestHit(x, aboveY, z, down);
          recordLowestHit(x, belowY, z, up);
        }
      }

      // A tiny epsilon avoids nudging objects that are already touching
      // (floating point noise from the raycasts themselves).
      if (Number.isFinite(lowestObjectY)) {
        const gap = lowestObjectY - floorTopY;
        if (Math.abs(gap) > 1e-4) {
          threeObject.position.y -= gap;
        }
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to snap object to floor',
          ErrorCode.SCENE_OPERATION_FAILED,
          { originalError: error }
        )
      );
    }
  }

  fitShadowCameraToObject(scene: IScene, object: IObject3D): Result<void> {
    try {
      if (!(scene instanceof ThreeSceneAdapter)) {
        return Result.err(
          new ThreeViewerError(
            'Scene must be ThreeSceneAdapter',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      let threeObject: THREE.Object3D;
      if (object instanceof ThreeObject3DAdapter) {
        threeObject = object.getThreeObject();
      } else if ('getThreeObject' in object && typeof object.getThreeObject === 'function') {
        threeObject = object.getThreeObject();
      } else {
        threeObject = object as unknown as THREE.Object3D;
      }

      const box = new THREE.Box3().setFromObject(threeObject);
      if (box.isEmpty() || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
        return Result.ok(undefined);
      }
      const size = box.getSize(new THREE.Vector3());

      const threeScene = scene.getThreeScene();
      const directionalLight = findDirectionalLight(threeScene);
      if (!directionalLight || !directionalLight.castShadow) {
        return Result.ok(undefined);
      }

      // Generous padding (matching the floor grid's own scaleFactor) so the
      // shadow — which can fall outside the object's own footprint at an
      // angle — isn't clipped by a frustum sized tightly to the object.
      const PADDING_FACTOR = 2;
      const MIN_HALF_EXTENT = 0.1;
      const halfExtent = Math.max(size.x, size.y, size.z, MIN_HALF_EXTENT) * PADDING_FACTOR;

      const shadowCamera = directionalLight.shadow.camera;
      shadowCamera.left = -halfExtent;
      shadowCamera.right = halfExtent;
      shadowCamera.top = halfExtent;
      shadowCamera.bottom = -halfExtent;
      shadowCamera.updateProjectionMatrix();

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to fit shadow camera to object',
          ErrorCode.SCENE_OPERATION_FAILED,
          { originalError: error }
        )
      );
    }
  }

  bakeContactShadow(scene: IScene, object: IObject3D, renderer: IRenderer): Result<void> {
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

      const threeObject = toThreeObject(object);
      if (!threeObject) {
        return Result.err(
          new ThreeViewerError(
            'Object must expose a Three.js Object3D',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      // No usable WebGL renderer (headless/SSR) or shadows disabled — the
      // live catcher, if any, stays in charge.
      const threeRenderer = toThreeRenderer(renderer.getInternalRenderer());
      if (!threeRenderer || !threeRenderer.shadowMap.enabled) {
        return Result.ok(undefined);
      }

      const directionalLight = findDirectionalLight(threeScene);
      if (!directionalLight || !directionalLight.castShadow) {
        return Result.ok(undefined);
      }

      this.contactShadowBaker.bake({
        renderer: threeRenderer,
        scene: threeScene,
        object: threeObject,
        light: directionalLight,
      });

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to bake contact shadow',
          ErrorCode.SCENE_OPERATION_FAILED,
          { originalError: error }
        )
      );
    }
  }

  setContactShadowMode(scene: IScene, mode: ContactShadowMode): Result<void> {
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

      const baked = threeScene.getObjectByName(CONTACT_SHADOW_BAKED_NAME);
      const live = threeScene.getObjectByName(CONTACT_SHADOW_LIVE_NAME);

      // Without a baked shadow there is nothing to switch to — keep the live
      // catcher up rather than leaving the floor shadowless.
      if (mode === 'baked' && !baked) {
        return Result.ok(undefined);
      }

      if (baked) {
        baked.visible = mode === 'baked';
      }
      if (live) {
        live.visible = mode === 'live';
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to switch contact shadow mode',
          ErrorCode.SCENE_OPERATION_FAILED,
          { originalError: error }
        )
      );
    }
  }

  wrapInUnitsScaleGroup(object: IObject3D, scaleToMeters: number): Result<IObject3D> {
    try {
      const threeObject = toThreeObject(object);
      if (!threeObject) {
        return Result.err(
          new ThreeViewerError(
            'Object must expose a Three.js Object3D',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      const wrapper = new THREE.Group();
      wrapper.name = UNITS_SCALE_WRAPPER_NAME;
      wrapper.scale.setScalar(scaleToMeters);
      wrapper.add(threeObject);
      return Result.ok(new ThreeObject3DAdapter(wrapper));
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to apply the units scale to the model',
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
      const threeObject = toThreeObject(object) ?? (object as unknown as THREE.Object3D);

      // Get the actual Three.js camera
      const threeCamera = (toThreeCamera(camera) ??
        (camera as unknown)) as THREE.PerspectiveCamera | THREE.OrthographicCamera;

      // Get the actual Three.js controls
      const threeControls = (toThreeControls(controls) ??
        (controls as unknown)) as OrbitControls | MapControls;

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
