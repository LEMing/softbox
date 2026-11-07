import React from 'react';
import { useViewerContext } from './ViewerContext';

/**
 * Canvas component for rendering 3D content
 */
export function ViewerCanvas() {
  const { canvasRef } = useViewerContext();

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        // Prevent image flickering during resize
        imageRendering: 'auto',
        // Ensure the canvas doesn't have any background that might flash
        background: 'transparent',
      }}
    />
  );
}