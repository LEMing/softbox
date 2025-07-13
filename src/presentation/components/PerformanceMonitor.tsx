import React, { useEffect, useState } from 'react';
import { useViewerCore, useViewerEvents } from '../hooks';

interface PerformanceStats {
  fps: number;
  frameCount: number;
  renderTime: number;
  samples?: number;
  isIdle: boolean;
  pathTracingActive: boolean;
}

export const PerformanceMonitor: React.FC<{ 
  viewer: ReturnType<typeof useViewerCore>['viewer'] 
}> = ({ viewer }) => {
  const [stats, setStats] = useState<PerformanceStats>({
    fps: 0,
    frameCount: 0,
    renderTime: 0,
    samples: 0,
    isIdle: true,
    pathTracingActive: false
  });

  // Track render events
  useViewerEvents(viewer, 'render:complete', (data) => {
    setStats(prev => ({
      ...prev,
      frameCount: data.frame,
      renderTime: data.renderTime,
      samples: data.samples,
      // Simple idle detection - if frame count hasn't changed, we're idle
      isIdle: data.frame === prev.frameCount
    }));
  });

  // Track path tracing completion
  useViewerEvents(viewer, 'pathtracing:complete', (data) => {
    setStats(prev => ({
      ...prev,
      pathTracingActive: false,
      samples: data.samples
    }));
  });

  // Calculate FPS
  useEffect(() => {
    let lastFrame = 0;
    let lastTime = performance.now();
    
    const calculateFPS = () => {
      const currentFrame = stats.frameCount;
      const currentTime = performance.now();
      const deltaTime = currentTime - lastTime;
      
      if (deltaTime > 0) {
        const fps = ((currentFrame - lastFrame) / deltaTime) * 1000;
        setStats(prev => ({ ...prev, fps: Math.round(fps) }));
      }
      
      lastFrame = currentFrame;
      lastTime = currentTime;
    };

    const interval = setInterval(calculateFPS, 500);
    return () => clearInterval(interval);
  }, [stats.frameCount]);

  const statusColor = stats.isIdle ? '#0f0' : '#f00';
  const statusText = stats.isIdle ? 'IDLE' : 'RENDERING';

  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '10px',
      fontFamily: 'monospace',
      fontSize: '12px',
      borderRadius: '4px',
      minWidth: '200px'
    }}>
      <div style={{ marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
        Performance Monitor
      </div>
      <div>FPS: <span style={{ color: stats.fps > 30 ? '#0f0' : '#ff0' }}>{stats.fps}</span></div>
      <div>Frames: {stats.frameCount}</div>
      <div>Render Time: {stats.renderTime.toFixed(2)}ms</div>
      {stats.samples !== undefined && (
        <div>Path Tracing: {stats.samples} samples</div>
      )}
      <div>
        Status: <span style={{ color: statusColor, fontWeight: 'bold' }}>{statusText}</span>
      </div>
    </div>
  );
};