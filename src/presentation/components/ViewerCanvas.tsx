import React from 'react';
import { useViewerContext } from './ViewerContext';

export function ViewerCanvas() {
  const { canvasRef } = useViewerContext();

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        imageRendering: 'auto',
        background: 'transparent',
      }}
    />
  );
}