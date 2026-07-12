import * as THREE from 'three';
import { ILightingOptions } from '../../../core/services/ISceneSetupService';
import { IScene } from '../../../core/interfaces/IScene';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { toThreeScene } from '../unwrap';

export function addLighting(scene: IScene, options: ILightingOptions): Result<void> {
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

          if (shadow.normalBias !== undefined) {
            directionalLight.shadow.normalBias = shadow.normalBias;
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

    // Shadowless studio accents. Added AFTER the key so findDirectionalLight
    // (which resolves the FIRST directional as the shadow/contact-shadow source)
    // still returns the key, not a fill/rim. Neither casts shadows — one shadow,
    // from the key, keeps the contact shadow single and clean.
    const addAccent = (
      accent: NonNullable<ILightingOptions['fill']>,
      fallback: [number, number, number]
    ) => {
      const light = new THREE.DirectionalLight(
        new THREE.Color(accent.color || '#ffffff'),
        accent.intensity ?? 1
      );
      const pos = accent.position ?? fallback;
      light.position.set(pos[0], pos[1], pos[2]);
      light.target.position.set(0, 0, 0);
      threeScene.add(light);
      threeScene.add(light.target);
    };
    // Soft opposite-side fill opens the shadow; rim/back light behind the
    // subject separates its silhouette from the backdrop.
    if (options.fill) {
      addAccent(options.fill, [-60, 30, 30]);
    }
    if (options.rim) {
      addAccent(options.rim, [20, 50, -70]);
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
