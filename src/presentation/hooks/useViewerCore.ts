import { useEffect, useRef, useState } from 'react';
import { ViewerCore } from '../../core/ViewerCore';
import { ViewerFactory } from '../../infrastructure/factories/ViewerFactory';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { pickRuntimeOptions } from '../../types/runtimeOptions';
import defaultOptions from '../../defaultOptions';
import { mergeWithPreset } from '../../presets';
import { useStableOptions } from './useStableOptions';
import { useViewportGate } from './useViewportGate';

/**
 * Hook to create and manage ViewerCore instance
 */
export function useViewerCore(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options: SimpleViewerOptions
) {
  const viewerRef = useRef<ViewerCore | null>(null);
  // Last dimensions handed to the CURRENT viewer, so the resize effect can skip
  // no-op resizes. Reset on every (re)build below: a fresh viewer's camera
  // starts at aspect 1, and a stale value here would make the resize effect's
  // initial call no-op, leaving that camera square (the path tracer then bakes
  // the wrong aspect and never refreshes it).
  const lastResizeRef = useRef({ width: 0, height: 0 });
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);

  // Split options into structural (rebuild) and runtime (apply live) sets
  const { options: stableOptions, structuralKey, runtimeKey } = useStableOptions(options);

  // `loading: 'lazy'` holds the whole boot — GL context, model fetch — until
  // the canvas first approaches the viewport. The gate latches open, so a
  // booted viewer never tears down on scroll or on a later option flip.
  const shouldBoot = useViewportGate(canvasRef, (options.loading ?? 'eager') === 'lazy');

  // Create viewer instance — only when a STRUCTURAL option changes
  useEffect(() => {
    if (!shouldBoot || !canvasRef.current || viewerRef.current) {
      return;
    }

    // Each build attempt starts clean — a construction failure returns no
    // cleanup, so a stale error would otherwise outlive a later successful
    // rebuild.
    setInitError(null);

    // Defaults + preset (deep-merged) + explicit options on top.
    const mergedOptions = mergeWithPreset(defaultOptions, stableOptions);

    // Create viewer with factory. A synchronous construction failure (e.g.
    // invalid options from an untyped consumer) must not escape the effect:
    // it would bypass the library's own error boundary (a child of this
    // component) and unmount the host application's tree.
    let viewer: ReturnType<typeof ViewerFactory.createViewer>;
    try {
      viewer = ViewerFactory.createViewer(canvasRef.current, mergedOptions);
    } catch (error) {
      console.error('Failed to create viewer:', error);
      setInitError(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    viewerRef.current = viewer;
    // The new viewer's camera is at aspect 1 until the resize effect sizes it;
    // clear the last-size memo so that effect's initial call actually applies
    // instead of no-opping on the previous viewer's (unchanged) dimensions.
    lastResizeRef.current = { width: 0, height: 0 };

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
        setInitError(result.error);
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
  }, [canvasRef, structuralKey, shouldBoot]);

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
    // structuralKey is the reliable "a new viewer was built" signal: a fast
    // rebuild can flip isInitialized false→true within one React batch (net
    // unchanged), so keying on isInitialized alone would skip re-sizing the fresh
    // viewer and its camera would keep its default aspect (a stretched frame).
  }, [isInitialized, canvasRef, structuralKey]);

  return {
    viewer: viewerRef.current,
    isInitialized,
    /** Set when viewer construction or initialization failed (e.g. WebGL unavailable). */
    initError,
  };
}