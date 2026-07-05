import { useEffect, useRef, useState } from 'react';
import { ViewerCore } from '../../core/ViewerCore';
import { ViewerFactory } from '../../infrastructure/factories/ViewerFactory';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { pickRuntimeOptions } from '../../types/runtimeOptions';
import defaultOptions from '../../defaultOptions';
import { mergeWithPreset } from '../../presets';
import { useStableOptions } from './useStableOptions';

/**
 * Hook to create and manage ViewerCore instance
 */
export function useViewerCore(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options: SimpleViewerOptions
) {
  const viewerRef = useRef<ViewerCore | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Split options into structural (rebuild) and runtime (apply live) sets
  const { options: stableOptions, structuralKey, runtimeKey } = useStableOptions(options);

  // Create viewer instance — only when a STRUCTURAL option changes
  useEffect(() => {
    if (!canvasRef.current || viewerRef.current) {
      return;
    }

    // Defaults + preset (deep-merged) + explicit options on top.
    const mergedOptions = mergeWithPreset(defaultOptions, stableOptions);

    // Create viewer with factory
    const viewer = ViewerFactory.createViewer(canvasRef.current, mergedOptions);
    viewerRef.current = viewer;

    // Guards against the StrictMode mount->cleanup->mount cycle (and option
    // changes) resolving a disposed viewer's initialize() promise.
    let cancelled = false;

    // Initialize viewer
    viewer.initialize().then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setIsInitialized(true);
      } else {
        console.error('Failed to initialize viewer:', result.error);
      }
    });

    // Cleanup
    return () => {
      cancelled = true;
      viewer.dispose();
      viewerRef.current = null;
      setIsInitialized(false);
    };
    // Depends on structuralKey only: a runtime-only change updates stableOptions'
    // identity but must NOT rebuild the viewer (handled by the effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- structuralKey is a content hash of the structural options; depending on stableOptions would rebuild on every change.
  }, [canvasRef, structuralKey]);

  // Apply the runtime-tunable look (background, exposure, environment intensity)
  // to the live viewer without tearing it down and re-fetching the model. This
  // is how switching a preset takes effect. Keyed on runtimeKey.
  useEffect(() => {
    if (!viewerRef.current || !isInitialized) {
      return;
    }
    const merged = mergeWithPreset(defaultOptions, stableOptions);
    viewerRef.current.updateOptions(pickRuntimeOptions(merged));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runtimeKey is a content hash of the runtime look; reading the resolved values inside is intentional.
  }, [runtimeKey, isInitialized]);

  // Track last resize dimensions to detect actual changes
  const lastResizeRef = useRef({ width: 0, height: 0 });

  // Handle resize
  useEffect(() => {
    if (!viewerRef.current || !canvasRef.current) {
      return;
    }

    let resizeFrameId: number | null = null;

    const handleResize = (entries?: ResizeObserverEntry[]) => {
      if (canvasRef.current && viewerRef.current) {
        const parentElement = canvasRef.current.parentElement || canvasRef.current;
        let { clientWidth, clientHeight } = parentElement;
        
        // If called from ResizeObserver, use the contentRect for more accurate dimensions
        if (entries && entries[0]) {
          const { width, height } = entries[0].contentRect;
          clientWidth = Math.floor(width);
          clientHeight = Math.floor(height);
        }
        
        // Only process if dimensions actually changed
        if (lastResizeRef.current.width === clientWidth && 
            lastResizeRef.current.height === clientHeight) {
          return;
        }

        // Cancel any pending resize frame
        if (resizeFrameId !== null) {
          cancelAnimationFrame(resizeFrameId);
        }

        // Use requestAnimationFrame for smooth, immediate updates
        resizeFrameId = requestAnimationFrame(() => {
          if (viewerRef.current && canvasRef.current) {
            viewerRef.current.resize(clientWidth, clientHeight);
            lastResizeRef.current = { width: clientWidth, height: clientHeight };
          }
        });
      }
    };

    // Initial resize
    handleResize();

    // Add resize listener
    const windowResizeHandler = () => handleResize();
    window.addEventListener('resize', windowResizeHandler);
    
    // Use ResizeObserver if available
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && canvasRef.current.parentElement) {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(canvasRef.current.parentElement);
    }

    return () => {
      window.removeEventListener('resize', windowResizeHandler);
      resizeObserver?.disconnect();
      if (resizeFrameId !== null) {
        cancelAnimationFrame(resizeFrameId);
      }
    };
  }, [isInitialized, canvasRef]);

  return {
    viewer: viewerRef.current,
    isInitialized,
  };
}