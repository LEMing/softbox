import * as THREE from 'three';
import { SimpleViewerOptions as NewSimpleViewerOptions } from '../types/SimpleViewerOptions';
import { SimpleViewerOptions as OldSimpleViewerOptions } from '../types';

/**
 * Maps new options format to old format for backward compatibility
 * This is a placeholder for future migration when we switch to the new type system
 */
export function mapLegacyOptions(options: Partial<OldSimpleViewerOptions>): OldSimpleViewerOptions {
  // For now, just return the options as-is since we're still using the old format
  return options as OldSimpleViewerOptions;
}

/**
 * Maps new format options to old format (for future use)
 */
export function mapNewToOldOptions(options: NewSimpleViewerOptions): OldSimpleViewerOptions {
  const result: any = {
    backgroundColor: options.backgroundColor,
    staticScene: options.staticScene,
    animationLoop: options.animationLoop,
    replaceWithScreenshotOnComplete: options.replaceWithScreenshotOnComplete,
  };

  // Map new camera format to old
  if (options.camera) {
    result.camera = {
      cameraPosition: options.camera.position || [60, 60, 60],
      cameraTarget: options.camera.target || [0, 0, 0],
      cameraFov: options.camera.fov || 75,
      cameraNear: options.camera.near || 0.1,
      cameraFar: options.camera.far || 100000,
      autoFitToObject: options.camera.autoFitToObject || false,
    };
  }

  // Map new renderer format to old
  if (options.renderer) {
    result.renderer = options.renderer;
  }

  // Map new controls format to old
  if (options.controls) {
    result.controls = options.controls;
  }

  // Map new lighting to old lightning (keeping the typo for compatibility)
  if (options.lighting) {
    result.lightning = options.lighting;
  } else if (options.lightning) {
    result.lightning = options.lightning;
  }

  // Map new helpers format to old
  if (options.helpers) {
    result.helpers = {
      gridHelper: options.helpers.grid !== undefined ? options.helpers.grid : true,
      axesHelper: options.helpers.axes !== undefined ? options.helpers.axes : false,
      color: options.helpers.color || '#AAAAAA',
      studioEnvironment: options.helpers.studioEnvironment !== undefined ? options.helpers.studioEnvironment : true,
      object3DHelper: options.helpers.object3DHelper || false,
      addGizmo: options.helpers.gizmo || false,
    };
  }

  // Map new path tracing format to old
  if (options.pathTracing) {
    result.usePathTracing = options.pathTracing.enabled || false;
    result.maxSamplesPathTracing = options.pathTracing.maxSamples || 300;
    result.pathTracingSettings = {
      bounces: options.pathTracing.bounces,
      transmissiveBounces: options.pathTracing.transmissiveBounces,
      lowResScale: options.pathTracing.lowResScale,
      renderScale: options.pathTracing.renderScale,
      enablePathTracing: options.pathTracing.enabled,
      dynamicLowRes: options.pathTracing.dynamicLowRes,
    };
  }

  // Map new environment format to old
  if (options.environment?.url) {
    result.envMapUrl = options.environment.url;
  }

  // Map new refs format to old
  if (options.refs) {
    result.threeBaseRefs = {
      scene: options.refs.scene,
      camera: options.refs.camera,
      renderer: options.refs.renderer,
      controls: options.refs.controls,
      mountPoint: options.refs.mountPoint,
    };
  }

  // Handle legacy properties
  if (options.usePathTracing !== undefined) {
    result.usePathTracing = options.usePathTracing;
  }
  if (options.maxSamplesPathTracing !== undefined) {
    result.maxSamplesPathTracing = options.maxSamplesPathTracing;
  }
  if (options.pathTracingSettings) {
    result.pathTracingSettings = options.pathTracingSettings;
  }
  if (options.envMapUrl) {
    result.envMapUrl = options.envMapUrl;
  }
  if (options.threeBaseRefs) {
    result.threeBaseRefs = options.threeBaseRefs;
  }

  return result as OldSimpleViewerOptions;
}