import { useEffect, useRef, useState } from 'react';
import { ViewerCore } from '../../core/ViewerCore';
import { ViewerFactory } from '../../infrastructure/factories/ViewerFactory';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { pickRuntimeOptions } from '../../types/runtimeOptions';
import defaultOptions from '../../defaultOptions';
import { mergeWithPreset } from '../../presets';
import { useStableOptions } from './useStableOptions';
import { useViewportGate } from './useViewportGate';

export function useViewerCore(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options: SimpleViewerOptions
) {
  const viewerRef = useRef<ViewerCore | null>(null);
  const lastResizeRef = useRef({ width: 0, height: 0 });
  const [viewer, setViewer] = useState<ViewerCore | null>(null);
  const isInitialized = viewer !== null;
  const [initError, setInitError] = useState<Error | null>(null);

  const { options: stableOptions, structuralKey, runtimeKey } = useStableOptions(options);

  const shouldBoot = useViewportGate(canvasRef, (options.loading ?? 'eager') === 'lazy');

  useEffect(() => {
    if (!shouldBoot || !canvasRef.current || viewerRef.current) {
      return;
    }

    setInitError(null);

    const mergedOptions = mergeWithPreset(defaultOptions, stableOptions);

    let built: ReturnType<typeof ViewerFactory.createViewer>;
    try {
      built = ViewerFactory.createViewer(canvasRef.current, mergedOptions);
    } catch (error) {
      console.error('Failed to create viewer:', error);
      setInitError(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    viewerRef.current = built;
    lastResizeRef.current = { width: 0, height: 0 };

    let cancelled = false;

    built.initialize().then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setViewer(built);
      } else {
        console.error('Failed to initialize viewer:', result.error);
        setInitError(result.error);
      }
    });

    return () => {
      cancelled = true;
      built.dispose();
      viewerRef.current = null;
      setViewer(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- structuralKey is a content hash of the structural options; depending on stableOptions would rebuild on every change.
  }, [canvasRef, structuralKey, shouldBoot]);

  useEffect(() => {
    if (!viewer) {
      return;
    }
    const merged = mergeWithPreset(defaultOptions, stableOptions);
    viewer.updateOptions(pickRuntimeOptions(merged));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runtimeKey is a content hash of the runtime look; reading the resolved values inside is intentional.
  }, [runtimeKey, viewer]);

  useEffect(() => {
    if (!viewerRef.current || !canvasRef.current) {
      return;
    }

    let resizeFrameId: number | null = null;

    const handleResize = (entries?: ResizeObserverEntry[]) => {
      if (canvasRef.current && viewerRef.current) {
        const parentElement = canvasRef.current.parentElement || canvasRef.current;
        let { clientWidth, clientHeight } = parentElement;
        
        if (entries && entries[0]) {
          const { width, height } = entries[0].contentRect;
          clientWidth = Math.floor(width);
          clientHeight = Math.floor(height);
        }
        
        if (lastResizeRef.current.width === clientWidth &&
            lastResizeRef.current.height === clientHeight) {
          return;
        }

        if (resizeFrameId !== null) {
          cancelAnimationFrame(resizeFrameId);
        }

        resizeFrameId = requestAnimationFrame(() => {
          if (viewerRef.current && canvasRef.current) {
            viewerRef.current.resize(clientWidth, clientHeight);
            lastResizeRef.current = { width: clientWidth, height: clientHeight };
          }
        });
      }
    };

    handleResize();

    const windowResizeHandler = () => handleResize();
    window.addEventListener('resize', windowResizeHandler);
    
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
  }, [viewer, canvasRef]);

  return {
    viewer,
    isInitialized,
    initError,
  };
}