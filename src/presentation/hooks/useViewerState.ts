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