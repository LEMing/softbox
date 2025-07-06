import { useEffect, useState } from 'react';
import { ViewerCore } from '../../core/ViewerCore';
import { ViewerState } from '../../core/entities/ViewerState';

/**
 * Hook to subscribe to ViewerCore state changes
 */
export function useViewerState(viewer: ViewerCore | null): ViewerState {
  const [state, setState] = useState<ViewerState>(
    viewer?.getState() || new ViewerState()
  );

  useEffect(() => {
    if (!viewer) {
      return;
    }

    // Set initial state
    setState(viewer.getState());

    // Subscribe to state changes
    const unsubscribe = viewer.onStateChange((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, [viewer]);

  return state;
}

/**
 * Hook to get specific state properties with memoization
 */
export function useViewerStatus(viewer: ViewerCore | null) {
  const state = useViewerState(viewer);
  
  return {
    status: state.status,
    isLoading: state.isLoading(),
    hasError: state.hasError(),
    error: state.error,
    canLoad: state.canLoad(),
    canRender: state.canRender(),
    loadProgress: state.loadProgress,
  };
}