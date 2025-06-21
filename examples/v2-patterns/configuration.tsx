/**
 * Example: Configuration Patterns in ThreeDViewer v2.0
 * 
 * This example shows:
 * - Modular configuration structure
 * - Runtime validation
 * - Dynamic configuration updates
 * - Configuration presets
 */

import React, { useRef, useState } from 'react';
import { SimpleViewer, SimpleViewerHandle, SimpleViewerOptions } from 'threedviewer';
import { OptionsValidator } from 'threedviewer/validation';
import { Result } from 'threedviewer/utils';

// Configuration presets
const PRESETS: Record<string, SimpleViewerOptions> = {
  default: {
    backgroundColor: '#1a1a1a',
    render: {
      antialias: true,
      shadowMap: true,
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1
    },
    camera: {
      type: 'perspective',
      fov: 75,
      position: [5, 5, 5],
      near: 0.1,
      far: 1000
    },
    controls: {
      type: 'orbit',
      enableDamping: true,
      dampingFactor: 0.05,
      autoRotate: false
    },
    helpers: {
      axes: true,
      grid: true,
      stats: false
    }
  },
  
  cinematic: {
    backgroundColor: '#000000',
    render: {
      antialias: true,
      shadowMap: true,
      toneMapping: THREE.CineonToneMapping,
      toneMappingExposure: 1.5
    },
    camera: {
      type: 'perspective',
      fov: 35, // Cinematic FOV
      position: [8, 3, 8],
      near: 0.1,
      far: 100
    },
    controls: {
      type: 'orbit',
      enableDamping: true,
      dampingFactor: 0.03,
      enablePan: false, // Restrict movement for cinematic feel
      minDistance: 5,
      maxDistance: 20
    },
    helpers: {
      axes: false,
      grid: false,
      stats: false
    }
  },
  
  technical: {
    backgroundColor: '#f0f0f0',
    render: {
      antialias: true,
      shadowMap: false,
      toneMapping: THREE.NoToneMapping
    },
    camera: {
      type: 'orthographic',
      position: [10, 10, 10],
      near: 0.1,
      far: 1000
    },
    controls: {
      type: 'map',
      enableDamping: false,
      enableRotate: true
    },
    helpers: {
      axes: true,
      grid: {
        size: 20,
        divisions: 20,
        color1: '#888888',
        color2: '#cccccc'
      },
      stats: true,
      object3DHelper: true
    }
  },
  
  pathTracing: {
    backgroundColor: '#1a1a1a',
    usePathTracing: true,
    pathTracing: {
      enabled: true,
      samples: 64,
      bounces: 4,
      renderScale: 0.5 // Start at half res for performance
    },
    render: {
      antialias: false, // Not needed with path tracing
      shadowMap: false
    },
    camera: {
      fov: 60,
      position: [5, 5, 5]
    },
    controls: {
      enableDamping: true
    },
    staticScene: true // Better for path tracing
  }
};

export function ConfigurationExample() {
  const viewerRef = useRef<SimpleViewerHandle>(null);
  const [currentPreset, setCurrentPreset] = useState('default');
  const [customConfig, setCustomConfig] = useState<Partial<SimpleViewerOptions>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Build final configuration
  const config: SimpleViewerOptions = {
    ...PRESETS[currentPreset],
    ...customConfig
  };

  // Validate configuration
  const validateConfig = (options: SimpleViewerOptions) => {
    const result = OptionsValidator.validate(options);
    if (!result.ok) {
      setValidationErrors(result.error.context?.errors || ['Unknown validation error']);
      return false;
    }
    setValidationErrors([]);
    return true;
  };

  // Configuration update handlers
  const updateFOV = (fov: number) => {
    const newConfig = {
      ...customConfig,
      camera: {
        ...customConfig.camera,
        fov
      }
    };
    
    // Validate before applying
    const testConfig = { ...config, ...newConfig };
    if (validateConfig(testConfig)) {
      setCustomConfig(newConfig);
    }
  };

  const toggleHelpers = (helper: keyof NonNullable<SimpleViewerOptions['helpers']>) => {
    setCustomConfig(prev => ({
      ...prev,
      helpers: {
        ...prev.helpers,
        [helper]: !config.helpers?.[helper]
      }
    }));
  };

  const updateRenderQuality = (quality: 'low' | 'medium' | 'high') => {
    const qualitySettings = {
      low: {
        render: { antialias: false },
        pathTracing: { samples: 16, renderScale: 0.25 }
      },
      medium: {
        render: { antialias: true },
        pathTracing: { samples: 64, renderScale: 0.5 }
      },
      high: {
        render: { antialias: true },
        pathTracing: { samples: 256, renderScale: 1 }
      }
    };

    setCustomConfig(prev => ({
      ...prev,
      ...qualitySettings[quality]
    }));
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Configuration Example</h2>
      
      {/* Controls */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Presets</h3>
        <div>
          {Object.keys(PRESETS).map(preset => (
            <button
              key={preset}
              onClick={() => {
                setCurrentPreset(preset);
                setCustomConfig({});
              }}
              style={{
                marginRight: '10px',
                fontWeight: currentPreset === preset ? 'bold' : 'normal'
              }}
            >
              {preset}
            </button>
          ))}
        </div>
        
        <h3>Custom Settings</h3>
        <div>
          <label>
            FOV: 
            <input
              type="range"
              min="20"
              max="120"
              value={config.camera?.fov || 75}
              onChange={(e) => updateFOV(Number(e.target.value))}
            />
            <span>{config.camera?.fov || 75}°</span>
          </label>
        </div>
        
        <div>
          <label>
            Background Color:
            <input
              type="color"
              value={config.backgroundColor as string || '#000000'}
              onChange={(e) => setCustomConfig(prev => ({
                ...prev,
                backgroundColor: e.target.value
              }))}
            />
          </label>
        </div>
        
        <div>
          <h4>Helpers</h4>
          <label>
            <input
              type="checkbox"
              checked={!!config.helpers?.axes}
              onChange={() => toggleHelpers('axes')}
            />
            Axes
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!config.helpers?.grid}
              onChange={() => toggleHelpers('grid')}
            />
            Grid
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!config.helpers?.stats}
              onChange={() => toggleHelpers('stats')}
            />
            Stats
          </label>
        </div>
        
        <div>
          <h4>Render Quality</h4>
          <button onClick={() => updateRenderQuality('low')}>Low</button>
          <button onClick={() => updateRenderQuality('medium')}>Medium</button>
          <button onClick={() => updateRenderQuality('high')}>High</button>
        </div>
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div style={{
          background: '#fee',
          border: '1px solid #fcc',
          padding: '10px',
          marginBottom: '20px'
        }}>
          <h4>Configuration Errors:</h4>
          <ul>
            {validationErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Current configuration display */}
      <details style={{ marginBottom: '20px' }}>
        <summary>Current Configuration</summary>
        <pre style={{
          background: '#f5f5f5',
          padding: '10px',
          overflow: 'auto',
          maxHeight: '200px'
        }}>
          {JSON.stringify(config, null, 2)}
        </pre>
      </details>

      {/* Viewer */}
      <div style={{ height: '500px', border: '1px solid #ddd' }}>
        <SimpleViewer
          ref={viewerRef}
          {...config}
          object="/models/sample.glb"
        />
      </div>
    </div>
  );
}

// Example: Dynamic configuration updates
export function DynamicConfigExample() {
  const viewerRef = useRef<SimpleViewerHandle>(null);
  const [config, setConfig] = useState<SimpleViewerOptions>(PRESETS.default);

  // Function to create configuration from scratch
  const createConfig = (): SimpleViewerOptions => {
    return {
      backgroundColor: '#' + Math.floor(Math.random()*16777215).toString(16),
      render: {
        antialias: Math.random() > 0.5,
        shadowMap: Math.random() > 0.5,
        toneMappingExposure: 0.5 + Math.random() * 2
      },
      camera: {
        fov: 30 + Math.random() * 60,
        position: [
          -10 + Math.random() * 20,
          Math.random() * 10,
          -10 + Math.random() * 20
        ]
      },
      controls: {
        autoRotate: Math.random() > 0.5,
        autoRotateSpeed: Math.random() * 5
      },
      helpers: {
        axes: Math.random() > 0.5,
        grid: Math.random() > 0.5
      }
    };
  };

  // Animate configuration changes
  const animateConfig = () => {
    const interval = setInterval(() => {
      setConfig(createConfig());
    }, 3000);

    return () => clearInterval(interval);
  };

  return (
    <div>
      <h2>Dynamic Configuration</h2>
      <button onClick={() => setConfig(createConfig())}>Random Config</button>
      <button onClick={animateConfig}>Animate Config (3s)</button>
      <button onClick={() => setConfig(PRESETS.default)}>Reset</button>
      
      <div style={{ height: '500px', marginTop: '20px' }}>
        <SimpleViewer
          ref={viewerRef}
          {...config}
        />
      </div>
    </div>
  );
}

// Example: Configuration builder pattern
export class ConfigBuilder {
  private config: SimpleViewerOptions = {};

  static create(): ConfigBuilder {
    return new ConfigBuilder();
  }

  withBackground(color: string | number): this {
    this.config.backgroundColor = color;
    return this;
  }

  withCamera(options: NonNullable<SimpleViewerOptions['camera']>): this {
    this.config.camera = { ...this.config.camera, ...options };
    return this;
  }

  withPathTracing(samples = 64, bounces = 4): this {
    this.config.usePathTracing = true;
    this.config.pathTracing = {
      enabled: true,
      samples,
      bounces,
      renderScale: 1
    };
    return this;
  }

  withHelpers(...helpers: Array<keyof NonNullable<SimpleViewerOptions['helpers']>>): this {
    this.config.helpers = this.config.helpers || {};
    helpers.forEach(helper => {
      this.config.helpers![helper] = true;
    });
    return this;
  }

  validate(): Result<SimpleViewerOptions> {
    return OptionsValidator.validate(this.config);
  }

  build(): SimpleViewerOptions {
    const result = this.validate();
    if (!result.ok) {
      throw result.error;
    }
    return result.value;
  }
}

// Usage of builder pattern
export function BuilderPatternExample() {
  const config = ConfigBuilder.create()
    .withBackground('#2a2a2a')
    .withCamera({ fov: 60, position: [5, 5, 5] })
    .withPathTracing(128, 6)
    .withHelpers('axes', 'grid', 'stats')
    .build();

  return <SimpleViewer {...config} />;
}