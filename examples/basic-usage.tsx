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
