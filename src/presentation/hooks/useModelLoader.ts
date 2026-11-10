import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { ViewerCore } from '../../core/ViewerCore';

export type ModelLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface ModelLoadState {
  status: ModelLoadStatus;
  error?: string;
}

export function useModelLoader(
  viewer: ViewerCore | null,
  isInitialized: boolean,
  object: THREE.Object3D | string | null
): ModelLoadState {
  const objectKey = useMemo(() => {
    if (typeof object === 'string') {
      return object;
    }
    if (object) {
      return `object-${object.uuid || 'no-uuid'}`;
    }
    return undefined;
  }, [object]);

  const [loadState, setLoadState] = useState<ModelLoadState>(() => ({
    status: object ? 'loading' : 'idle',
  }));

  useEffect(() => {
    setLoadState({ status: object ? 'loading' : 'idle' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on objectKey (object's stable identity), not the object reference.
  }, [objectKey]);

  useEffect(() => {
    if (!viewer || !isInitialized || !object || viewer.isDisposed()) {
      return;
    }

    let active = true;
    viewer.loadModel(object).then((result) => {
      if (!active || viewer.isDisposed()) {
        return;
      }
      if (result.ok) {
        setLoadState({ status: 'loaded' });
      } else {
        setLoadState({ status: 'error', error: result.error.message });
        console.error('Failed to load model:', result.error);
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- objectKey is the stable identity of `object`; depending on `object` would reload on every new reference with the same key.
  }, [viewer, isInitialized, objectKey]);

  return loadState;
}
