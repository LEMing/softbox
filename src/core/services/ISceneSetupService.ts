import { Result } from '../../utils/Result';
import { IScene } from '../interfaces/IScene';
import { IObject3D } from '../interfaces/IObject3D';
import { ICamera } from '../interfaces/ICamera';
import { IControls } from '../interfaces/IControls';
import { IRenderer } from '../interfaces/IRenderer';

/**
 * Which contact-shadow representation is shown on the floor: the baked
 * area-light texture (static scenes) or the real-time shadow catcher
 * (playing animations, where a baked snapshot would lag the model).
 */
export type ContactShadowMode = 'baked' | 'live';

/**
 * Service for setting up scene elements like helpers, lighting, and backgrounds
 */
export interface ISceneSetupService {
  /**
   * Add helper objects to the scene
   */
  addHelpers(scene: IScene, options: IHelperOptions): Result<void>;
  
  /**
   * Add lighting to the scene
   */
  addLighting(scene: IScene, options: ILightingOptions): Result<void>;
  
  /**
   * Create gradient background
   */
  createGradientBackground(scene: IScene, options: IGradientOptions): Result<void>;
  
  /**
   * Fit camera to object
   */
  fitCameraToObject(object: IObject3D, camera: ICamera, controls: IControls): Result<void>;
  
  /**
   * Add dynamic grid based on object size
   */
  addDynamicGrid(scene: IScene, object: IObject3D, scaleFactor?: number): Result<void>;

  /**
   * Drop the object onto the floor by raycasting down from above its
   * footprint against both the object's own meshes and the floor/grid
   * meshes already in the scene, then shifting it by the smallest gap
   * found. Corrects models whose overall bounding box (used by the initial,
   * cheaper floor alignment) doesn't represent their true lowest contact
   * point — e.g. a baked ground-shadow decal or reference plane that sits
   * lower than the wheels/feet that actually touch down.
   */
  snapObjectToFloor(scene: IScene, object: IObject3D): Result<void>;

  /**
   * Resize the key directional light's shadow-camera frustum to fit the
   * loaded object. The frustum bounds are otherwise a fixed world-space
   * size set once at scene construction, before any model exists — fine
   * for a car-sized object, but a small object (e.g. a 6cm avocado) then
   * occupies only a handful of shadow-map texels, so its shadow renders
   * blocky/quantized instead of smooth. Called after the object's final
   * position is known (i.e. after floor snapping).
   */
  fitShadowCameraToObject(scene: IScene, object: IObject3D): Result<void>;

  /**
   * Bake a soft area-light contact shadow for the object onto the floor by
   * averaging many jittered shadow renders (sharp and dark at the contact
   * point, progressively softer with distance — the way a real finite-size
   * light behaves), then swap it in for the real-time shadow catcher. A
   * single shadow-map pass cannot produce that distance-dependent penumbra.
   * Called after floor snapping and shadow-camera fitting; safe no-op when
   * the renderer or a shadow-casting key light isn't available.
   */
  bakeContactShadow(scene: IScene, object: IObject3D, renderer: IRenderer): Result<void>;

  /**
   * Switch between the baked contact shadow and the real-time catcher —
   * playback of animations must fall back to 'live' because the baked
   * texture is a snapshot of one pose.
   */
  setContactShadowMode(scene: IScene, mode: ContactShadowMode): Result<void>;

  /**
   * Wrap the object in a scale group that converts its authored units to the
   * viewer's 1-unit-=-1-meter convention. The object's own transform is not
   * touched, so consumer-provided objects survive re-loads without compounding
   * and models with a corrective root scale keep it.
   */
  wrapInUnitsScaleGroup(object: IObject3D, scaleToMeters: number): Result<IObject3D>;
}

import { GridHelperOptions, AxesHelperOptions } from '../../types/options/HelperOptions';

export interface IHelperOptions {
  grid?: boolean | GridHelperOptions;
  gridSize?: number;
  gridDivisions?: number;
  gridColor?: string;
  gridCenterLineColor?: string;
  axes?: boolean | AxesHelperOptions;
  axesSize?: number;
  object3DHelper?: boolean;
}

export interface ILightingOptions {
  ambient?: {
    color?: string;
    intensity?: number;
  };
  hemisphere?: {
    skyColor?: string;
    groundColor?: string;
    intensity?: number;
  };
  directional?: {
    color?: string;
    intensity?: number;
    position?: [number, number, number];
    castShadow?: boolean;
    shadow?: {
      mapSize?: { width: number; height: number };
      camera?: {
        near?: number;
        far?: number;
        left?: number;
        right?: number;
        top?: number;
        bottom?: number;
      };
      bias?: number;
      radius?: number;
    };
  };
}

export interface IGradientOptions {
  topColor: string;
  bottomColor: string;
  offset?: number;
  exponent?: number;
  /**
   * Draw a RADIAL gradient (a soft studio vignette) instead of the default
   * top-to-bottom vertical one: `topColor` becomes the centre (behind the
   * subject) and `bottomColor` the darker edge/corner. Used by the dark preset
   * to float the model in a near-black cove instead of a flat scrim.
   */
  radial?: boolean;
}