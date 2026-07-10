import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { ViewerCore } from '../../core/ViewerCore';
import { ThreeObject3DAdapter } from '../../infrastructure/three/ThreeObject3D';

export type ModelLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface ModelLoadState {
  status: ModelLoadStatus;
  error?: string;
}

/**
 * Loads `object` into the viewer once it is ready and tracks the load state
 * that drives the built-in overlay. Keyed on the object's stable identity (its
 * URL, or a uuid for a THREE.Object3D) so a new reference with the same
 * identity doesn't retrigger a load, and a superseded load never writes its
 * stale result.
 */
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

  // A model provided but not yet on screen counts as loading from the first
  // frame, so the scene is never briefly blank.
  useEffect(() => {
    setLoadState({ status: object ? 'loading' : 'idle' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on objectKey (object's stable identity), not the object reference.
  }, [objectKey]);

  useEffect(() => {
    // A structural rebuild disposes the previous viewer in the SAME commit that
    // this effect runs with the (now stale) viewer reference — loading into it
    // would hit the "after dispose" guard and surface a scary error, even though
    // the fresh viewer will load the model correctly. Skip the disposed one.
    if (!viewer || !isInitialized || !object || viewer.isDisposed()) {
      return;
    }

    let active = true;
    const toLoad = typeof object === 'string'
      ? object
      : new ThreeObject3DAdapter(object as THREE.Object3D);
    viewer.loadModel(toLoad).then((result) => {
      // A newer object superseded this load, or the viewer was torn down while
      // it was in flight — don't write (or log) a stale/dead result.
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
