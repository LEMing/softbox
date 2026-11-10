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


    if (options.ambient) {
      const color = new THREE.Color(options.ambient.color || '#404040');
      const intensity = options.ambient.intensity ?? Math.PI;
      const ambientLight = new THREE.AmbientLight(color, intensity);
      threeScene.add(ambientLight);
    }

    if (options.hemisphere) {
      const skyColor = new THREE.Color(options.hemisphere.skyColor || '#ffffbb');
      const groundColor = new THREE.Color(options.hemisphere.groundColor || '#080820');
      const intensity = options.hemisphere.intensity ?? 1;
      const hemisphereLight = new THREE.HemisphereLight(skyColor, groundColor, intensity);
      threeScene.add(hemisphereLight);
    }

    if (options.directional) {
      const color = new THREE.Color(options.directional.color || '#ffffff');
      const intensity = options.directional.intensity ?? Math.PI;
      const directionalLight = new THREE.DirectionalLight(color, intensity);

      if (options.directional.position) {
        const pos = options.directional.position;
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

      directionalLight.target.position.set(0, 0, 0);
      threeScene.add(directionalLight);
      threeScene.add(directionalLight.target);

      if (directionalLight.shadow) {
        directionalLight.shadow.camera.updateProjectionMatrix();
      }
    }

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
