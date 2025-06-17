import { SimpleViewerOptions } from '../types';
import { Result } from '../utils/Result';
import { ThreeViewerError, ErrorCode } from '../errors';
import * as THREE from 'three';

interface ValidationError {
  field: string;
  message: string;
  value?: any;
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
    if (options.usePathTracing && options.pathTracingSettings) {
      this.validatePathTracingOptions(options.pathTracingSettings);
    }

    // Validate lightning options
    if (options.lightning) {
      this.validateLightningOptions(options.lightning);
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
    // FOV validation
    if (camera.cameraFov !== undefined) {
      if (camera.cameraFov < 1 || camera.cameraFov > 180) {
        this.errors.push({
          field: 'camera.cameraFov',
          message: 'Camera FOV must be between 1 and 180 degrees',
          value: camera.cameraFov
        });
      }
    }

    // Near plane validation
    if (camera.cameraNear !== undefined) {
      if (camera.cameraNear <= 0) {
        this.errors.push({
          field: 'camera.cameraNear',
          message: 'Camera near plane must be positive',
          value: camera.cameraNear
        });
      }
    }

    // Far plane validation
    if (camera.cameraFar !== undefined) {
      if (camera.cameraFar <= 0) {
        this.errors.push({
          field: 'camera.cameraFar',
          message: 'Camera far plane must be positive',
          value: camera.cameraFar
        });
      }

      // Near/Far relationship
      if (camera.cameraNear !== undefined && camera.cameraFar <= camera.cameraNear) {
        this.errors.push({
          field: 'camera.cameraFar',
          message: 'Camera far plane must be greater than near plane',
          value: { near: camera.cameraNear, far: camera.cameraFar }
        });
      }
    }

    // Position validation
    if (camera.cameraPosition) {
      if (!Array.isArray(camera.cameraPosition) || camera.cameraPosition.length !== 3) {
        this.errors.push({
          field: 'camera.cameraPosition',
          message: 'Camera position must be an array of 3 numbers',
          value: camera.cameraPosition
        });
      } else if (!camera.cameraPosition.every(v => typeof v === 'number' && !isNaN(v))) {
        this.errors.push({
          field: 'camera.cameraPosition',
          message: 'Camera position values must be valid numbers',
          value: camera.cameraPosition
        });
      }
    }

    // Target validation
    if (camera.cameraTarget) {
      if (!Array.isArray(camera.cameraTarget) || camera.cameraTarget.length !== 3) {
        this.errors.push({
          field: 'camera.cameraTarget',
          message: 'Camera target must be an array of 3 numbers',
          value: camera.cameraTarget
        });
      } else if (!camera.cameraTarget.every(v => typeof v === 'number' && !isNaN(v))) {
        this.errors.push({
          field: 'camera.cameraTarget',
          message: 'Camera target values must be valid numbers',
          value: camera.cameraTarget
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
      if (!validMappings.includes(renderer.toneMapping as any)) {
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
    // Axes helper validation
    if (typeof helpers.axesHelper === 'number') {
      if (helpers.axesHelper <= 0) {
        this.errors.push({
          field: 'helpers.axesHelper',
          message: 'Axes helper size must be positive',
          value: helpers.axesHelper
        });
      }
    }

    // Color validation
    if (helpers.color !== undefined) {
      if (!this.isValidColor(helpers.color)) {
        this.errors.push({
          field: 'helpers.color',
          message: 'Invalid color format',
          value: helpers.color
        });
      }
    }
  }

  private static validatePathTracingOptions(pathTracing: NonNullable<SimpleViewerOptions['pathTracingSettings']>): void {
    // Bounces validation
    if (pathTracing.bounces !== undefined) {
      if (pathTracing.bounces < 0 || pathTracing.bounces > 32) {
        this.errors.push({
          field: 'pathTracingSettings.bounces',
          message: 'Bounces must be between 0 and 32',
          value: pathTracing.bounces
        });
      }
    }

    // Transmissive bounces validation
    if (pathTracing.transmissiveBounces !== undefined) {
      if (pathTracing.transmissiveBounces < 0 || pathTracing.transmissiveBounces > 32) {
        this.errors.push({
          field: 'pathTracingSettings.transmissiveBounces',
          message: 'Transmissive bounces must be between 0 and 32',
          value: pathTracing.transmissiveBounces
        });
      }
    }

    // Render scale validation
    if (pathTracing.renderScale !== undefined) {
      if (pathTracing.renderScale <= 0 || pathTracing.renderScale > 2) {
        this.errors.push({
          field: 'pathTracingSettings.renderScale',
          message: 'Render scale must be between 0 and 2',
          value: pathTracing.renderScale
        });
      }
    }

    // Low res scale validation
    if (pathTracing.lowResScale !== undefined) {
      if (pathTracing.lowResScale <= 0 || pathTracing.lowResScale > 1) {
        this.errors.push({
          field: 'pathTracingSettings.lowResScale',
          message: 'Low res scale must be between 0 and 1',
          value: pathTracing.lowResScale
        });
      }
    }
  }

  private static validateLightningOptions(lightning: NonNullable<SimpleViewerOptions['lightning']>): void {
    // Validate ambient light
    if (lightning.ambientLight) {
      if (lightning.ambientLight.intensity !== undefined && lightning.ambientLight.intensity < 0) {
        this.errors.push({
          field: 'lightning.ambientLight.intensity',
          message: 'Ambient light intensity must be non-negative',
          value: lightning.ambientLight.intensity
        });
      }

      if (lightning.ambientLight.color !== undefined) {
        if (!this.isValidColor(lightning.ambientLight.color)) {
          this.errors.push({
            field: 'lightning.ambientLight.color',
            message: 'Invalid ambient light color format',
            value: lightning.ambientLight.color
          });
        }
      }
    }

    // Validate hemisphere light
    if (lightning.hemisphereLight) {
      if (lightning.hemisphereLight.intensity !== undefined && lightning.hemisphereLight.intensity < 0) {
        this.errors.push({
          field: 'lightning.hemisphereLight.intensity',
          message: 'Hemisphere light intensity must be non-negative',
          value: lightning.hemisphereLight.intensity
        });
      }

      if (lightning.hemisphereLight.skyColor !== undefined) {
        if (!this.isValidColor(lightning.hemisphereLight.skyColor)) {
          this.errors.push({
            field: 'lightning.hemisphereLight.skyColor',
            message: 'Invalid hemisphere light sky color format',
            value: lightning.hemisphereLight.skyColor
          });
        }
      }

      if (lightning.hemisphereLight.groundColor !== undefined) {
        if (!this.isValidColor(lightning.hemisphereLight.groundColor)) {
          this.errors.push({
            field: 'lightning.hemisphereLight.groundColor',
            message: 'Invalid hemisphere light ground color format',
            value: lightning.hemisphereLight.groundColor
          });
        }
      }
    }

    // Validate directional light
    if (lightning.directionalLight) {
      if (lightning.directionalLight.intensity !== undefined && lightning.directionalLight.intensity < 0) {
        this.errors.push({
          field: 'lightning.directionalLight.intensity',
          message: 'Directional light intensity must be non-negative',
          value: lightning.directionalLight.intensity
        });
      }

      if (lightning.directionalLight.color !== undefined) {
        if (!this.isValidColor(lightning.directionalLight.color)) {
          this.errors.push({
            field: 'lightning.directionalLight.color',
            message: 'Invalid directional light color format',
            value: lightning.directionalLight.color
          });
        }
      }

      // Validate shadow camera bounds
      if (lightning.directionalLight.shadow?.camera) {
        const shadowCam = lightning.directionalLight.shadow.camera;
        if (shadowCam.left !== undefined && shadowCam.right !== undefined) {
          if (shadowCam.left >= shadowCam.right) {
            this.errors.push({
              field: 'lightning.directionalLight.shadow.camera',
              message: 'Shadow camera left must be less than right',
              value: { left: shadowCam.left, right: shadowCam.right }
            });
          }
        }
        if (shadowCam.bottom !== undefined && shadowCam.top !== undefined) {
          if (shadowCam.bottom >= shadowCam.top) {
            this.errors.push({
              field: 'lightning.directionalLight.shadow.camera',
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
  private static isValidColor(color: any): boolean {
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