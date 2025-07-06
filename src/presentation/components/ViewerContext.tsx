import React, { createContext, useContext } from 'react';
import { ViewerCore } from '../../core/ViewerCore';

interface ViewerContextValue {
  viewer: ViewerCore | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export interface ViewerProviderProps {
  viewer: ViewerCore | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  children: React.ReactNode;
}

/**
 * Provider component for viewer context
 */
export function ViewerProvider({ viewer, canvasRef, children }: ViewerProviderProps) {
  return (
    <ViewerContext.Provider value={{ viewer, canvasRef }}>
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