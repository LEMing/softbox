import * as THREE from 'three';
import { mapLegacyOptions, mapNewToOldOptions } from '../optionsMapper';
import { ControlType } from '../../types';
import { SimpleViewerOptions as NewSimpleViewerOptions } from '../../types/SimpleViewerOptions';

describe('optionsMapper', () => {
  describe('mapLegacyOptions', () => {
    it('should return options as-is for now', () => {
      const options = {
        backgroundColor: '#000000',
        staticScene: true,
        camera: {
          cameraPosition: [1, 2, 3] as [number, number, number],
          cameraTarget: [0, 0, 0] as [number, number, number],
          cameraFov: 75,
          cameraNear: 0.1,
          cameraFar: 1000,
          autoFitToObject: true,
        },
      };

      const result = mapLegacyOptions(options);
      expect(result).toEqual(options);
    });
  });

  describe('mapNewToOldOptions', () => {
    it('should map new camera format to old', () => {
      const newOptions: Partial<NewSimpleViewerOptions> = {
        camera: {
          position: [1, 2, 3],
          target: [0, 0, 0],
          fov: 75,
          near: 0.1,
          far: 1000,
          autoFitToObject: true,
        },
      };

      const result = mapNewToOldOptions(newOptions as NewSimpleViewerOptions);

      expect(result.camera).toEqual({
        cameraPosition: [1, 2, 3],
        cameraTarget: [0, 0, 0],
        cameraFov: 75,
        cameraNear: 0.1,
        cameraFar: 1000,
        autoFitToObject: true,
      });
    });

    it('should map renderer options correctly', () => {
      const newOptions = {
        renderer: {
          antialias: true,
          alpha: false,
          shadowMapEnabled: true,
          pixelRatio: 2,
          shadowMapType: THREE.PCFSoftShadowMap,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.5,
        },
      };

      const result = mapNewToOldOptions(newOptions as any);

      expect(result.renderer).toEqual({
        antialias: true,
        alpha: false,
        shadowMapEnabled: true,
        pixelRatio: 2,
        shadowMapType: THREE.PCFSoftShadowMap,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.5,
      });
    });

    it('should map controls options correctly', () => {
      const newOptions = {
        controls: {
          type: ControlType.OrbitControls,
          enabled: true,
          enableDamping: true,
          dampingFactor: 0.25,
          enableZoom: true,
          enableRotate: true,
          enablePan: true,
        },
      };

      const result = mapNewToOldOptions(newOptions as any);

      expect(result.controls).toEqual({
        type: ControlType.OrbitControls,
        enabled: true,
        enableDamping: true,
        dampingFactor: 0.25,
        enableZoom: true,
        enableRotate: true,
        enablePan: true,
      });
    });

    it('should map lighting to lightning', () => {
      const newOptions: Partial<NewSimpleViewerOptions> = {
        lighting: {
          ambientLight: {
            color: '#ffffff',
            intensity: 1,
          },
        },
      };

      const result = mapNewToOldOptions(newOptions as NewSimpleViewerOptions);

      expect(result.lightning).toEqual({
        ambientLight: {
          color: '#ffffff',
          intensity: 1,
        },
      });
    });

    it('should map helpers correctly', () => {
      const result = mapNewToOldOptions({
        helpers: {
          grid: true,
          axes: false,
          color: '#ff0000',
          studioEnvironment: true,
          object3DHelper: false,
          gizmo: true,
        },
      } as NewSimpleViewerOptions);

      expect(result.helpers).toEqual({
        gridHelper: true,
        axesHelper: false,
        color: '#ff0000',
        studioEnvironment: true,
        object3DHelper: false,
        addGizmo: true,
      });
    });

    it('should map path tracing options correctly', () => {
      const result = mapNewToOldOptions({
        pathTracing: {
          enabled: true,
          maxSamples: 500,
          bounces: 8,
          transmissiveBounces: 4,
          renderScale: 1.0,
        },
      } as NewSimpleViewerOptions);

      expect(result.usePathTracing).toBe(true);
      expect(result.maxSamplesPathTracing).toBe(500);
      expect(result.pathTracingSettings).toMatchObject({
        bounces: 8,
        transmissiveBounces: 4,
        renderScale: 1.0,
        enablePathTracing: true,
      });
    });

    it('should map environment URL correctly', () => {
      const result = mapNewToOldOptions({
        environment: {
          url: 'https://example.com/env.hdr',
        },
      } as NewSimpleViewerOptions);

      expect(result.envMapUrl).toBe('https://example.com/env.hdr');
    });

    it('should map refs correctly', () => {
      const mockRefs = {
        scene: { current: null },
        camera: { current: null },
        renderer: { current: null },
        controls: { current: null },
        mountPoint: { current: null },
      };

      const result = mapNewToOldOptions({
        refs: mockRefs,
      } as NewSimpleViewerOptions);

      expect(result.threeBaseRefs).toEqual(mockRefs);
    });

    it('should handle legacy properties in new options', () => {
      const newOptions = {
        backgroundColor: '#000000',
        staticScene: true,
        animationLoop: null,
        usePathTracing: true,
        maxSamplesPathTracing: 300,
        pathTracingSettings: { bounces: 8 },
        envMapUrl: 'test.hdr',
        lightning: { ambientLight: { color: '#fff', intensity: 1 } },
        threeBaseRefs: { scene: { current: null } },
      };

      const result = mapNewToOldOptions(newOptions as any);

      // Should preserve all legacy options
      expect(result.usePathTracing).toBe(true);
      expect(result.maxSamplesPathTracing).toBe(300);
      expect(result.pathTracingSettings).toEqual({ bounces: 8 });
      expect(result.envMapUrl).toBe('test.hdr');
      expect(result.lightning).toEqual({ ambientLight: { color: '#fff', intensity: 1 } });
      expect(result.threeBaseRefs).toEqual({ scene: { current: null } });
    });

    it('should handle empty options', () => {
      const result = mapNewToOldOptions({} as any);

      expect(result.backgroundColor).toBeUndefined();
      expect(result.staticScene).toBeUndefined();
      expect(result.camera).toBeUndefined();
      expect(result.renderer).toBeUndefined();
    });

    it('should handle partial options with defaults', () => {
      const newOptions: Partial<NewSimpleViewerOptions> = {
        camera: {
          fov: 60,
          autoFitToObject: false,
        },
        helpers: {
          grid: false,
        },
      };

      const result = mapNewToOldOptions(newOptions as NewSimpleViewerOptions);

      expect(result.camera).toEqual({
        cameraPosition: [60, 60, 60], // defaults
        cameraTarget: [0, 0, 0], // defaults
        cameraFov: 60,
        cameraNear: 0.1, // default
        cameraFar: 100000, // default
        autoFitToObject: false,
      });
      expect(result.helpers).toEqual({
        gridHelper: false,
        axesHelper: false, // default
        color: '#AAAAAA', // default
        studioEnvironment: true, // default
        object3DHelper: false, // default
        addGizmo: false, // default
      });
    });
  });
});