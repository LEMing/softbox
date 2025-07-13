import { useRef, useMemo } from 'react';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';

/**
 * Custom hook to provide stable options reference
 * Prevents unnecessary re-renders in useViewerCore
 */
export function useStableOptions(options: SimpleViewerOptions): SimpleViewerOptions {
  const optionsRef = useRef<SimpleViewerOptions>(options);
  
  // Create a stable key from options that affect viewer creation
  const optionsKey = useMemo(() => {
    // Include only options that should trigger viewer recreation
    return JSON.stringify({
      pathTracing: options.pathTracing,
      staticScene: options.staticScene,
      renderer: options.renderer,
      camera: options.camera,
      controls: options.controls,
      backgroundColor: options.backgroundColor,
      environment: options.environment,
      lighting: options.lighting,
      helpers: options.helpers,
    });
  }, [
    options.pathTracing,
    options.staticScene,
    options.renderer,
    options.camera,
    options.controls,
    options.backgroundColor,
    options.environment,
    options.lighting,
    options.helpers,
  ]);

  // Update ref when key changes
  useMemo(() => {
    optionsRef.current = options;
  }, [optionsKey, options]);

  return optionsRef.current;
}