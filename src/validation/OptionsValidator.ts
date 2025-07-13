import { SimpleViewerOptions } from '../types';
import { Result } from '../utils/Result';
import { ThreeViewerError, ErrorCode } from '../errors';
import { GridHelperOptions, AxesHelperOptions } from '../types/options/HelperOptions';
import * as THREE from 'three';

interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export class OptionsValidator {
  private static errors: ValidationError[] = [];

  /**
   * Validates SimpleViewerOptions and returns a Result
   */
  static validate(options: SimpleViewerOptions): Result<SimpleViewerOptions> {
    this.errors = [];

    // Validate camera options
    if (options.camera) {
      this.validateCameraOptions(options.camera);
    }

    // Validate renderer options
    if (options.renderer) {
      this.validateRendererOptions(options.renderer);
    }

    // Validate controls options
    if (options.controls) {
      this.validateControlsOptions(options.controls);
    }

    // Validate helpers options
    if (options.helpers) {
      this.validateHelpersOptions(options.helpers);
    }

    // Validate path tracing options
    if (options.pathTracing) {
      this.validatePathTracingOptions(options.pathTracing);
    }

    // Validate lighting options
    if (options.lighting) {
      this.validateLightingOptions(options.lighting);
    }

    // Check for errors
    if (this.errors.length > 0) {
      return Result.err(
        new ThreeViewerError(
          `Invalid configuration: ${this.errors.length} validation error(s)`,
          ErrorCode.INVALID_CONFIGURATION,
          { 
            errors: this.errors,
            options 
          }
        )
      );
    }

    return Result.ok(options);
  }

  private static validateCameraOptions(camera: NonNullable<SimpleViewerOptions['camera']>): void {
    const { fov, near, far, position, target } = camera;

    // FOV validation
    if (fov !== undefined) {
      if (fov < 1 || fov > 180) {
        this.errors.push({
          field: 'camera.fov',
          message: 'Camera FOV must be between 1 and 180 degrees',
          value: fov
        });
      }
    }

    // Near plane validation
    if (near !== undefined) {
      if (near <= 0) {
        this.errors.push({
          field: 'camera.near',
          message: 'Camera near plane must be positive',
          value: near
        });
      }
    }

    // Far plane validation
    if (far !== undefined) {
      if (far <= 0) {
        this.errors.push({
          field: 'camera.far',
          message: 'Camera far plane must be positive',
          value: far
        });
      }

      // Near/Far relationship
      if (near !== undefined && far <= near) {
        this.errors.push({
          field: 'camera.far',
          message: 'Camera far plane must be greater than near plane',
          value: { near: near, far: far }
        });
      }
    }

    // Position validation
    if (position) {
      if (!Array.isArray(position) || position.length !== 3) {
        this.errors.push({
          field: 'camera.position',
          message: 'Camera position must be an array of 3 numbers',
          value: position
        });
      } else if (!position.every((v) => typeof v === 'number' && !isNaN(v as number))) {
        this.errors.push({
          field: 'camera.position',
          message: 'Camera position values must be valid numbers',
          value: position
        });
      }
    }

    // Target validation
    if (target) {
      if (!Array.isArray(target) || target.length !== 3) {
        this.errors.push({
          field: 'camera.target',
          message: 'Camera target must be an array of 3 numbers',
          value: target
        });
      } else if (!target.every((v) => typeof v === 'number' && !isNaN(v as number))) {
        this.errors.push({
          field: 'camera.target',
          message: 'Camera target values must be valid numbers',
          value: target
        });
      }
    }
  }

  private static validateRendererOptions(renderer: NonNullable<SimpleViewerOptions['renderer']>): void {
    // Pixel ratio validation
    if (renderer.pixelRatio !== undefined) {
      if (renderer.pixelRatio <= 0 || renderer.pixelRatio > 4) {
        this.errors.push({
          field: 'renderer.pixelRatio',
          message: 'Pixel ratio must be between 0 and 4',
          value: renderer.pixelRatio
        });
      }
    }

    // Tone mapping exposure validation
    if (renderer.toneMappingExposure !== undefined) {
      if (renderer.toneMappingExposure < 0) {
        this.errors.push({
          field: 'renderer.toneMappingExposure',
          message: 'Tone mapping exposure must be non-negative',
          value: renderer.toneMappingExposure
        });
      }
    }

    // Validate shadow map type
    if (renderer.shadowMapType !== undefined) {
      const validTypes = [
        THREE.BasicShadowMap,
        THREE.PCFShadowMap,
        THREE.PCFSoftShadowMap,
        THREE.VSMShadowMap
      ];
      if (!validTypes.includes(renderer.shadowMapType)) {
        this.errors.push({
          field: 'renderer.shadowMapType',
          message: 'Invalid shadow map type',
          value: renderer.shadowMapType
        });
      }
    }

    // Validate tone mapping
    if (renderer.toneMapping !== undefined) {
      const validMappings = [
        THREE.NoToneMapping,
        THREE.LinearToneMapping,
        THREE.ReinhardToneMapping,
        THREE.CineonToneMapping,
        THREE.ACESFilmicToneMapping,
        THREE.CustomToneMapping,
        THREE.AgXToneMapping,
        THREE.NeutralToneMapping
      ];
      if (!validMappings.includes(renderer.toneMapping as THREE.ToneMapping)) {
        this.errors.push({
          field: 'renderer.toneMapping',
          message: 'Invalid tone mapping type',
          value: renderer.toneMapping
        });
      }
    }
  }

  private static validateControlsOptions(controls: NonNullable<SimpleViewerOptions['controls']>): void {
    // Damping factor validation
    if (controls.dampingFactor !== undefined) {
      if (controls.dampingFactor < 0 || controls.dampingFactor > 1) {
        this.errors.push({
          field: 'controls.dampingFactor',
          message: 'Damping factor must be between 0 and 1',
          value: controls.dampingFactor
        });
      }
    }

    // Note: autoRotateSpeed is not in the current type definition
    // It's only available in the new ControlsOptions interface
  }

  private static validateHelpersOptions(helpers: NonNullable<SimpleViewerOptions['helpers']>): void {
    // Grid validation
    if (typeof helpers.grid === 'object' && helpers.grid !== null) {
      const gridOptions = helpers.grid as GridHelperOptions;
      if (gridOptions.size !== undefined && gridOptions.size <= 0) {
        this.errors.push({
          field: 'helpers.grid.size',
          message: 'Grid size must be positive',
          value: gridOptions.size
        });
      }
      if (gridOptions.divisions !== undefined && gridOptions.divisions <= 0) {
        this.errors.push({
          field: 'helpers.grid.divisions',
          message: 'Grid divisions must be positive',
          value: gridOptions.divisions
        });
      }
    }

    // Axes validation
    if (typeof helpers.axes === 'object' && helpers.axes !== null) {
      const axesOptions = helpers.axes as AxesHelperOptions;
      if (axesOptions.size !== undefined && axesOptions.size <= 0) {
        this.errors.push({
          field: 'helpers.axes.size',
          message: 'Axes size must be positive',
          value: axesOptions.size
        });
      }
    }
  }

  private static validatePathTracingOptions(pathTracing: NonNullable<SimpleViewerOptions['pathTracing']>): void {
    // Skip validation if path tracing is disabled
    if (!pathTracing.enabled) {
      return;
    }

    // Bounces validation
    if (pathTracing.bounces !== undefined) {
      if (pathTracing.bounces < 0 || pathTracing.bounces > 32) {
        this.errors.push({
          field: 'pathTracing.bounces',
          message: 'Bounces must be between 0 and 32',
          value: pathTracing.bounces
        });
      }
    }

    // Transmissive bounces validation
    if (pathTracing.transmissiveBounces !== undefined) {
      if (pathTracing.transmissiveBounces < 0 || pathTracing.transmissiveBounces > 32) {
        this.errors.push({
          field: 'pathTracing.transmissiveBounces',
          message: 'Transmissive bounces must be between 0 and 32',
          value: pathTracing.transmissiveBounces
        });
      }
    }

    // Render scale validation
    if (pathTracing.renderScale !== undefined) {
      if (pathTracing.renderScale <= 0 || pathTracing.renderScale > 2) {
        this.errors.push({
          field: 'pathTracing.renderScale',
          message: 'Render scale must be between 0 and 2',
          value: pathTracing.renderScale
        });
      }
    }

    // Low res scale validation
    if (pathTracing.lowResScale !== undefined) {
      if (pathTracing.lowResScale <= 0 || pathTracing.lowResScale > 1) {
        this.errors.push({
          field: 'pathTracing.lowResScale',
          message: 'Low res scale must be between 0 and 1',
          value: pathTracing.lowResScale
        });
      }
    }
  }

  private static validateLightingOptions(lighting: NonNullable<SimpleViewerOptions['lighting']>): void {
    // Validate ambient light
    if (lighting.ambientLight) {
      if (lighting.ambientLight.intensity !== undefined && lighting.ambientLight.intensity < 0) {
        this.errors.push({
          field: 'lighting.ambientLight.intensity',
          message: 'Ambient light intensity must be non-negative',
          value: lighting.ambientLight.intensity
        });
      }

      if (lighting.ambientLight.color !== undefined) {
        if (!this.isValidColor(lighting.ambientLight.color)) {
          this.errors.push({
            field: 'lighting.ambientLight.color',
            message: 'Invalid ambient light color format',
            value: lighting.ambientLight.color
          });
        }
      }
    }

    // Validate hemisphere light
    if (lighting.hemisphereLight) {
      if (lighting.hemisphereLight.intensity !== undefined && lighting.hemisphereLight.intensity < 0) {
        this.errors.push({
          field: 'lighting.hemisphereLight.intensity',
          message: 'Hemisphere light intensity must be non-negative',
          value: lighting.hemisphereLight.intensity
        });
      }

      if (lighting.hemisphereLight.skyColor !== undefined) {
        if (!this.isValidColor(lighting.hemisphereLight.skyColor)) {
          this.errors.push({
            field: 'lighting.hemisphereLight.skyColor',
            message: 'Invalid hemisphere light sky color format',
            value: lighting.hemisphereLight.skyColor
          });
        }
      }

      if (lighting.hemisphereLight.groundColor !== undefined) {
        if (!this.isValidColor(lighting.hemisphereLight.groundColor)) {
          this.errors.push({
            field: 'lighting.hemisphereLight.groundColor',
            message: 'Invalid hemisphere light ground color format',
            value: lighting.hemisphereLight.groundColor
          });
        }
      }
    }

    // Validate directional light
    if (lighting.directionalLight) {
      if (lighting.directionalLight.intensity !== undefined && lighting.directionalLight.intensity < 0) {
        this.errors.push({
          field: 'lighting.directionalLight.intensity',
          message: 'Directional light intensity must be non-negative',
          value: lighting.directionalLight.intensity
        });
      }

      if (lighting.directionalLight.color !== undefined) {
        if (!this.isValidColor(lighting.directionalLight.color)) {
          this.errors.push({
            field: 'lighting.directionalLight.color',
            message: 'Invalid directional light color format',
            value: lighting.directionalLight.color
          });
        }
      }

      // Validate shadow camera bounds
      if (lighting.directionalLight.shadow?.camera) {
        const shadowCam = lighting.directionalLight.shadow.camera;
        if (shadowCam.left !== undefined && shadowCam.right !== undefined) {
          if (shadowCam.left >= shadowCam.right) {
            this.errors.push({
              field: 'lighting.directionalLight.shadow.camera',
              message: 'Shadow camera left must be less than right',
              value: { left: shadowCam.left, right: shadowCam.right }
            });
          }
        }
        if (shadowCam.bottom !== undefined && shadowCam.top !== undefined) {
          if (shadowCam.bottom >= shadowCam.top) {
            this.errors.push({
              field: 'lighting.directionalLight.shadow.camera',
              message: 'Shadow camera bottom must be less than top',
              value: { bottom: shadowCam.bottom, top: shadowCam.top }
            });
          }
        }
      }
    }
  }

  /**
   * Get detailed validation errors for debugging
   */
  static getValidationErrors(): ValidationError[] {
    return [...this.errors];
  }

  /**
   * Format validation errors as a readable string
   */
  static formatErrors(errors: ValidationError[]): string {
    return errors.map(error => 
      `${error.field}: ${error.message}${error.value !== undefined ? ` (value: ${JSON.stringify(error.value)})` : ''}`
    ).join('\n');
  }

  /**
   * Check if a value is a valid THREE.Color input
   */
  private static isValidColor(color: unknown): boolean {
    if (typeof color === 'number') {
      return true; // Numbers are valid colors
    }
    
    if (typeof color === 'string') {
      // Check hex format
      if (/^#[0-9a-f]{6}$/i.test(color)) {
        return true;
      }
      
      // Check rgb/rgba format
      if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(color)) {
        return true;
      }
      if (/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/i.test(color)) {
        return true;
      }
      
      // Check CSS color names
      const cssColors = [
        'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
        'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
        'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue',
        'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgrey', 'darkgreen', 'darkkhaki',
        'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
        'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
        'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick',
        'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
        'gray', 'grey', 'green', 'greenyellow', 'honeydew', 'hotpink', 'indianred', 'indigo',
        'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
        'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgrey', 'lightgreen',
        'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
        'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta',
        'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
        'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
        'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite',
        'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
        'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink',
        'plum', 'powderblue', 'purple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon',
        'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue',
        'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle',
        'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
      ];
      
      return cssColors.includes(color.toLowerCase());
    }
    
    return false;
  }
}