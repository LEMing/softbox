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
import { ThreeCameraAdapter } from './ThreeCamera';
import { ThreeOrbitControlsAdapter, ThreeMapControlsAdapter } from './ThreeControls';
import HexGrid from './HexGrid';
import { HexTileConfig } from './HexTileConfig';

// Type definitions for Three.js scene userData
interface SceneUserData {
  gridOptions?: {
    enabled: boolean;
    color: string;
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

      // Don't add grid here - it will be added dynamically after model loads
      // Store grid options for later use
      if (options.grid) {
        const userData = threeScene.userData as SceneUserData;
        threeScene.userData = {
          ...userData,
          gridOptions: {
            enabled: true,
            color: options.gridColor || '#AAAAAA'
          }
        };
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

      // Remove existing hex grid if any
      const existingGrids: THREE.Object3D[] = [];
      threeScene.traverse((child: THREE.Object3D) => {
        if (child.userData?.isHexGrid) {
          existingGrids.push(child);
        }
      });
      existingGrids.forEach(grid => threeScene.remove(grid));

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
      
      console.log('Object size:', size);
      
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
      
      console.log('Grid parameters:', { 
        tileSize, 
        gridRadius, 
        requiredWidth, 
        hexWidth,
        actualCoverage: (2 * gridRadius + 1) * hexWidth 
      });
      
      // Create and add the hex grid
      const hexGrid = new HexGrid(
        gridRadius,
        tileSize,
        gridOptions.color
      );
      
      // Mark the grid group so we can identify it later
      const gridGroup = new THREE.Group();
      gridGroup.userData.isHexGrid = true;
      hexGrid.generateGrid().forEach(tile => {
        const mesh = tile.createMesh();
        gridGroup.add(mesh);
      });
      
      threeScene.add(gridGroup);

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

      // Apply as background
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
      
      console.log('Fitting camera to object:', {
        center,
        size,
        maxDimension: Math.max(size.x, size.y, size.z)
      });
      
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
      
      console.log('Camera positioned at:', { x: cameraX, y: cameraY, z: cameraZ });
      console.log('Looking at:', center);

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