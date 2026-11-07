import React, { createContext, useContext, useMemo } from 'react';
import { ViewerCore } from '../../core/ViewerCore';

interface ViewerContextValue {
  viewer: ViewerCore | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export interface ViewerProviderProps {
  viewer: ViewerCore | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  children: React.ReactNode;
}

/**
 * Provider component for viewer context
 */
export function ViewerProvider({ viewer, canvasRef, children }: ViewerProviderProps) {
  const value = useMemo(() => ({ viewer, canvasRef }), [viewer, canvasRef]);
  return (
    <ViewerContext.Provider value={value}>
      {children}
    </ViewerContext.Provider>
  );
}

/**
 * Hook to access viewer context
 */
export function useViewerContext() {
  const context = useContext(ViewerContext);
  if (!context) {
    throw new Error('useViewerContext must be used within ViewerProvider');
  }
  return context;
}