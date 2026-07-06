/**
 * Accurate, minimal usage of the public API:
 *  - <SimpleViewer object={...} options={...} ref={...} />
 *  - the imperative handle (loadModel / dispose / scene-camera-renderer-controls)
 *  - typed events via handle.events
 *  - the Result-free error surface (ThreeViewerError / ErrorCode)
 *
 * Type-checked in CI (tsconfig.examples.json) so it cannot drift from the API.
 */
import React, { useEffect, useRef } from 'react';
import {
  SimpleViewer,
  defaultOptions,
  ErrorCode,
  type SimpleViewerHandle,
  type SimpleViewerOptions,
} from 'softbox';

const MODEL_URL =
  'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb';

const options: SimpleViewerOptions = {
  ...defaultOptions,
  backgroundColor: '#202024',
};

export function BasicUsage() {
  const viewerRef = useRef<SimpleViewerHandle>(null);

  useEffect(() => {
    const handle = viewerRef.current;
    if (!handle) {
      return;
    }

    const offLoaded = handle.events.on('model:loaded', ({ model, loadTime }) => {
      console.log(`Loaded ${model.name || 'model'} in ${loadTime.toFixed(0)}ms`);
    });

    const offError = handle.events.on('model:error', ({ error }) => {
      // error is a ThreeViewerError with a typed code
      if (error.code === ErrorCode.MODEL_LOAD_FAILED) {
        console.error('Model failed to load:', error.message);
      }
    });

    return () => {
      offLoaded();
      offError();
    };
  }, []);

  const reload = async (): Promise<void> => {
    try {
      await viewerRef.current?.loadModel(MODEL_URL);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div style={{ width: '100%', height: '600px' }}>
      <SimpleViewer ref={viewerRef} object={MODEL_URL} options={options} />
      <button type="button" onClick={reload}>
        Reload model
      </button>
    </div>
  );
}
