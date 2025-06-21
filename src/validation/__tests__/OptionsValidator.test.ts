import { OptionsValidator } from '../OptionsValidator';
import { SimpleViewerOptions } from '../../types';
import { ErrorCode } from '../../errors';
import * as THREE from 'three';
import defaultOptions from '../../defaultOptions';

describe('OptionsValidator', () => {
  describe('valid options', () => {
    it('should validate default options successfully', () => {
      const result = OptionsValidator.validate(defaultOptions);
      expect(result.ok).toBe(true);
    });

    it('should validate partial options with defaults', () => {
      const options: Partial<SimpleViewerOptions> = {
        backgroundColor: '#ffffff'
      };
      // Merge with defaults for complete options
      const completeOptions = { ...defaultOptions, ...options };
      const result = OptionsValidator.validate(completeOptions);
      expect(result.ok).toBe(true);
    });

    it('should validate complete valid options', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        camera: {
          ...defaultOptions.camera,
          cameraFov: 75,
          cameraNear: 0.1,
          cameraFar: 1000,
          cameraPosition: [1, 2, 3],
          cameraTarget: [0, 0, 0]
        },
        renderer: {
          ...defaultOptions.renderer,
          pixelRatio: 2,
          toneMappingExposure: 1,
          shadowMapType: THREE.PCFSoftShadowMap,
          toneMapping: THREE.ACESFilmicToneMapping
        },
        controls: {
          ...defaultOptions.controls,
          dampingFactor: 0.5
        },
        helpers: {
          ...defaultOptions.helpers,
          axesHelper: true,
          color: '#ff0000'
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(true);
    });
  });

  describe('camera validation', () => {
    it('should reject invalid FOV', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        camera: { 
          ...defaultOptions.camera,
          cameraFov: 200 
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.INVALID_CONFIGURATION);
        expect(result.error.context?.errors).toContainEqual({
          field: 'camera.cameraFov',
          message: 'Camera FOV must be between 1 and 180 degrees',
          value: 200
        });
      }
    });

    it('should reject negative near plane', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        camera: { 
          ...defaultOptions.camera,
          cameraNear: -1 
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context?.errors).toContainEqual({
          field: 'camera.cameraNear',
          message: 'Camera near plane must be positive',
          value: -1
        });
      }
    });

    it('should reject when far plane is less than near plane', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        camera: {
          ...defaultOptions.camera,
          cameraNear: 10,
          cameraFar: 5
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context?.errors).toContainEqual({
          field: 'camera.cameraFar',
          message: 'Camera far plane must be greater than near plane',
          value: { near: 10, far: 5 }
        });
      }
    });

    it('should reject invalid camera position', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        camera: { 
          ...defaultOptions.camera,
          cameraPosition: [1, 2] as any 
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context?.errors).toContainEqual({
          field: 'camera.cameraPosition',
          message: 'Camera position must be an array of 3 numbers',
          value: [1, 2]
        });
      }
    });

    it('should reject NaN values in camera position', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        camera: { 
          ...defaultOptions.camera,
          cameraPosition: [1, NaN, 3] 
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context?.errors).toContainEqual({
          field: 'camera.cameraPosition',
          message: 'Camera position values must be valid numbers',
          value: [1, NaN, 3]
        });
      }
    });
  });

  describe('renderer validation', () => {
    it('should reject invalid pixel ratio', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        renderer: { 
          ...defaultOptions.renderer,
          pixelRatio: 5 
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context?.errors).toContainEqual({
          field: 'renderer.pixelRatio',
          message: 'Pixel ratio must be between 0 and 4',
          value: 5
        });
      }
    });

    it('should reject negative tone mapping exposure', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        renderer: { 
          ...defaultOptions.renderer,
          toneMappingExposure: -1 
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context?.errors).toContainEqual({
          field: 'renderer.toneMappingExposure',
          message: 'Tone mapping exposure must be non-negative',
          value: -1
        });
      }
    });

    it('should reject invalid shadow map type', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        renderer: { 
          ...defaultOptions.renderer,
          shadowMapType: 999 as any 
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context?.errors).toContainEqual({
          field: 'renderer.shadowMapType',
          message: 'Invalid shadow map type',
          value: 999
        });
      }
    });

    it('should accept all valid tone mapping types', () => {
      const validMappings = [
        THREE.NoToneMapping,
        THREE.LinearToneMapping,
        THREE.ReinhardToneMapping,
        THREE.CineonToneMapping,
        THREE.ACESFilmicToneMapping,
        THREE.AgXToneMapping,
        THREE.NeutralToneMapping
      ];

      validMappings.forEach(toneMapping => {
        const options: SimpleViewerOptions = {
          ...defaultOptions,
          renderer: { 
            ...defaultOptions.renderer,
            toneMapping 
          }
        };
        const result = OptionsValidator.validate(options);
        expect(result.ok).toBe(true);
      });
    });
  });

  describe('controls validation', () => {
    it('should reject damping factor outside range', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        controls: { 
          ...defaultOptions.controls,
          dampingFactor: 1.5 
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context?.errors).toContainEqual({
          field: 'controls.dampingFactor',
          message: 'Damping factor must be between 0 and 1',
          value: 1.5
        });
      }
    });

    // Note: autoRotateSpeed is not in the current SimpleViewerOptions controls type
    // This test is commented out until the types are updated
    /*
    it('should reject infinite auto rotate speed', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        controls: { 
          ...defaultOptions.controls,
          autoRotateSpeed: Infinity 
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context?.errors).toContainEqual({
          field: 'controls.autoRotateSpeed',
          message: 'Auto rotate speed must be a finite number',
          value: Infinity
        });
      }
    });
    */
  });

  describe('helpers validation', () => {
    // Note: axesHelper in current types is boolean, not number
    // This test validates the future type system where it can be a number
    it('should accept boolean axes helper', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        helpers: { 
          ...defaultOptions.helpers,
          axesHelper: true 
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(true);
    });

    it('should accept false axes helper', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        helpers: { 
          ...defaultOptions.helpers,
          axesHelper: false 
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(true);
    });

    it('should reject invalid color format', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        helpers: { 
          ...defaultOptions.helpers,
          color: 'invalid-color' 
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context?.errors).toContainEqual({
          field: 'helpers.color',
          message: 'Invalid color format',
          value: 'invalid-color'
        });
      }
    });

    it('should accept valid color formats', () => {
      const validColors = ['#ff0000', 'red', 'rgb(255, 0, 0)'];
      validColors.forEach(color => {
        const options: SimpleViewerOptions = {
          ...defaultOptions,
          helpers: { 
            ...defaultOptions.helpers,
            color 
          }
        };
        const result = OptionsValidator.validate(options);
        expect(result.ok).toBe(true);
      });
      
      // Test number color by modifying type at runtime
      const optionsWithNumberColor: any = {
        ...defaultOptions,
        helpers: { 
          ...defaultOptions.helpers,
          color: 0xff0000 // Actual number
        }
      };
      const result = OptionsValidator.validate(optionsWithNumberColor as SimpleViewerOptions);
      expect(result.ok).toBe(true);
    });
  });

  describe('path tracing validation', () => {
    it('should validate path tracing options when enabled', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        usePathTracing: true,
        pathTracingSettings: {
          ...defaultOptions.pathTracingSettings,
          bounces: 8,
          transmissiveBounces: 4,
          renderScale: 1.0,
          lowResScale: 0.5
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(true);
    });

    it('should reject bounces outside range', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        usePathTracing: true,
        pathTracingSettings: {
          ...defaultOptions.pathTracingSettings,
          bounces: 50
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context?.errors).toContainEqual({
          field: 'pathTracingSettings.bounces',
          message: 'Bounces must be between 0 and 32',
          value: 50
        });
      }
    });

    it('should reject render scale outside range', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        usePathTracing: true,
        pathTracingSettings: {
          ...defaultOptions.pathTracingSettings,
          renderScale: 3
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context?.errors).toContainEqual({
          field: 'pathTracingSettings.renderScale',
          message: 'Render scale must be between 0 and 2',
          value: 3
        });
      }
    });

    it('should not validate path tracing options when disabled', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        usePathTracing: false,
        pathTracingSettings: {
          ...defaultOptions.pathTracingSettings,
          bounces: 50 // Invalid, but should not be checked
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(true);
    });
  });

  describe('lightning validation', () => {
    it('should reject negative light intensities', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        lightning: {
          ...defaultOptions.lightning,
          ambientLight: { 
            ...defaultOptions.lightning.ambientLight!,
            intensity: -1 
          },
          hemisphereLight: { 
            ...defaultOptions.lightning.hemisphereLight!,
            intensity: -2 
          },
          directionalLight: { 
            ...defaultOptions.lightning.directionalLight!,
            intensity: -3 
          }
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const errors = result.error.context?.errors;
        expect(errors).toHaveLength(3);
        expect(errors).toContainEqual({
          field: 'lightning.ambientLight.intensity',
          message: 'Ambient light intensity must be non-negative',
          value: -1
        });
      }
    });

    it('should validate light colors', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        lightning: {
          ...defaultOptions.lightning,
          ambientLight: { 
            ...defaultOptions.lightning.ambientLight!,
            color: 'invalid-color' 
          },
          hemisphereLight: { 
            ...defaultOptions.lightning.hemisphereLight!,
            skyColor: 'invalid-sky',
            groundColor: 'invalid-ground'
          },
          directionalLight: { 
            ...defaultOptions.lightning.directionalLight!,
            color: 'invalid-directional' 
          }
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const errors = result.error.context?.errors;
        expect(errors).toHaveLength(4);
      }
    });

    it('should validate shadow camera bounds', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        lightning: {
          ...defaultOptions.lightning,
          directionalLight: {
            ...defaultOptions.lightning.directionalLight!,
            shadow: {
              ...defaultOptions.lightning.directionalLight!.shadow,
              camera: {
                ...defaultOptions.lightning.directionalLight!.shadow.camera,
                left: 10,
                right: -10,
                bottom: 10,
                top: -10
              }
            }
          }
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const errors = result.error.context?.errors;
        expect(errors).toContainEqual({
          field: 'lightning.directionalLight.shadow.camera',
          message: 'Shadow camera left must be less than right',
          value: { left: 10, right: -10 }
        });
        expect(errors).toContainEqual({
          field: 'lightning.directionalLight.shadow.camera',
          message: 'Shadow camera bottom must be less than top',
          value: { bottom: 10, top: -10 }
        });
      }
    });
  });

  describe('multiple errors', () => {
    it('should collect all validation errors', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        camera: {
          ...defaultOptions.camera,
          cameraFov: 200,
          cameraNear: -1
        },
        renderer: {
          ...defaultOptions.renderer,
          pixelRatio: 10,
          toneMappingExposure: -5
        },
        controls: {
          ...defaultOptions.controls,
          dampingFactor: 2
        }
      };
      const result = OptionsValidator.validate(options);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context?.errors).toHaveLength(5);
        expect(result.error.message).toContain('5 validation error(s)');
      }
    });
  });

  describe('error formatting', () => {
    it('should format errors as readable string', () => {
      const errors = [
        { field: 'camera.fov', message: 'Invalid FOV', value: 200 },
        { field: 'renderer.pixelRatio', message: 'Invalid ratio' }
      ];
      const formatted = OptionsValidator.formatErrors(errors);
      expect(formatted).toBe(
        'camera.fov: Invalid FOV (value: 200)\n' +
        'renderer.pixelRatio: Invalid ratio'
      );
    });
  });

  describe('getValidationErrors', () => {
    it('should return copy of errors array', () => {
      const options: SimpleViewerOptions = {
        ...defaultOptions,
        camera: { 
          ...defaultOptions.camera,
          cameraFov: 200 
        }
      };
      OptionsValidator.validate(options);
      
      const errors1 = OptionsValidator.getValidationErrors();
      const errors2 = OptionsValidator.getValidationErrors();
      
      expect(errors1).not.toBe(errors2); // Different array instances
      expect(errors1).toEqual(errors2); // Same content
    });
  });
});