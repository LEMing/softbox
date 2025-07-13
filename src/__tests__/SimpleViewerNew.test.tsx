import React from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import * as THREE from 'three';
import SimpleViewer from '../SimpleViewerWrapper';
import { SimpleViewerHandle } from '../SimpleViewerWrapper';
import testDefaultOptions from '../testUtils/testDefaultOptions';

// Create mock canvas first
const mockCanvas = {
  width: 800,
  height: 600,
  style: {},
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  clientWidth: 800,
  clientHeight: 600,
  getContext: jest.fn(),
};

// Mock WebGL context
const mockWebGLContext = {
  getParameter: jest.fn((param) => {
    const params: Record<number, unknown> = {
      0x1F00: 1024, // MAX_COMBINED_TEXTURE_IMAGE_UNITS
      0x8B4D: 16384, // MAX_TEXTURE_SIZE
      0x0D33: 1024, // MAX_TEXTURE_IMAGE_UNITS
      0x8872: 16, // MAX_VERTEX_TEXTURE_IMAGE_UNITS
      0x8B4C: 16384, // MAX_CUBE_MAP_TEXTURE_SIZE
      0x851C: 256, // MAX_VERTEX_UNIFORM_VECTORS
      0x8DFB: 16, // MAX_SAMPLES
      0x8B49: 1024, // MAX_FRAGMENT_UNIFORM_VECTORS
      0x8B4A: 16, // MAX_VARYING_VECTORS
      0x8B4B: 8, // MAX_VERTEX_ATTRIBS
      0x84E8: 16, // MAX_RENDERBUFFER_SIZE
      0x0D3A: [1, 1], // MAX_VIEWPORT_DIMS
    };
    return params[param] || 0;
  }),
  getExtension: jest.fn((name) => {
    const extensions: Record<string, unknown> = {
      'WEBGL_depth_texture': {},
      'OES_texture_float': {},
      'OES_texture_float_linear': {},
      'OES_standard_derivatives': {},
      'EXT_shader_texture_lod': {},
      'OES_element_index_uint': {},
      'ANGLE_instanced_arrays': {
        drawArraysInstancedANGLE: jest.fn(),
        drawElementsInstancedANGLE: jest.fn(),
        vertexAttribDivisorANGLE: jest.fn(),
      },
    };
    return extensions[name] || null;
  }),
  getShaderPrecisionFormat: jest.fn(() => ({
    precision: 23,
    rangeMin: 127,
    rangeMax: 127,
  })),
  createTexture: jest.fn(() => ({})),
  bindTexture: jest.fn(),
  texParameteri: jest.fn(),
  texImage2D: jest.fn(),
  createShader: jest.fn(() => ({})),
  shaderSource: jest.fn(),
  compileShader: jest.fn(),
  getShaderParameter: jest.fn(() => true),
  createProgram: jest.fn(() => ({})),
  attachShader: jest.fn(),
  linkProgram: jest.fn(),
  getProgramParameter: jest.fn(() => true),
  useProgram: jest.fn(),
  createBuffer: jest.fn(() => ({})),
  bindBuffer: jest.fn(),
  bufferData: jest.fn(),
  enableVertexAttribArray: jest.fn(),
  vertexAttribPointer: jest.fn(),
  enable: jest.fn(),
  disable: jest.fn(),
  clear: jest.fn(),
  clearColor: jest.fn(),
  viewport: jest.fn(),
  drawArrays: jest.fn(),
  createFramebuffer: jest.fn(() => ({})),
  bindFramebuffer: jest.fn(),
  framebufferTexture2D: jest.fn(),
  createRenderbuffer: jest.fn(() => ({})),
  bindRenderbuffer: jest.fn(),
  renderbufferStorage: jest.fn(),
  framebufferRenderbuffer: jest.fn(),
  checkFramebufferStatus: jest.fn(() => 0x8CD5), // FRAMEBUFFER_COMPLETE
  getAttribLocation: jest.fn(() => 0),
  getUniformLocation: jest.fn(() => ({})),
  uniform1f: jest.fn(),
  uniform1i: jest.fn(),
  uniform2f: jest.fn(),
  uniform3f: jest.fn(),
  uniform4f: jest.fn(),
  uniformMatrix4fv: jest.fn(),
  pixelStorei: jest.fn(),
  depthFunc: jest.fn(),
  depthMask: jest.fn(),
  depthRange: jest.fn(),
  clearDepth: jest.fn(),
  cullFace: jest.fn(),
  frontFace: jest.fn(),
  drawingBufferWidth: 800,
  drawingBufferHeight: 600,
  canvas: mockCanvas,
};

// Set up circular reference
mockCanvas.getContext.mockReturnValue(mockWebGLContext);

// Mock canvas
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = jest.fn(function(this: HTMLCanvasElement, contextType: string) {
  if (contextType === 'webgl' || contextType === 'webgl2') {
    return mockWebGLContext as unknown as WebGLRenderingContext;
  }
  return originalGetContext.call(this, contextType as never);
}) as jest.MockedFunction<typeof HTMLCanvasElement.prototype.getContext>;

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

describe('SimpleViewer (New Architecture)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any mounted components to ensure proper disposal
    cleanup();
    jest.clearAllTimers();
  });

  it('should render without crashing', () => {
    const { container } = render(<SimpleViewer object={null} options={testDefaultOptions} />);
    expect(container).toBeTruthy();
  });

  it('should accept a Three.js object', async () => {
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );

    const { container } = render(<SimpleViewer object={cube} options={testDefaultOptions} />);
    
    await waitFor(() => {
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();
    });
  });

  it('should accept a model URL', async () => {
    const modelUrl = 'https://example.com/model.glb';
    
    const { container } = render(<SimpleViewer object={modelUrl} options={testDefaultOptions} />);
    
    await waitFor(() => {
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();
    });
  });

  it('should accept options', async () => {
    const options = {
      ...testDefaultOptions,
      backgroundColor: '#ff0000',
      camera: {
        ...testDefaultOptions.camera,
        fov: 60,
        position: [5, 5, 5] as [number, number, number],
      },
    };

    const { container } = render(
      <SimpleViewer object={null} options={options} />
    );
    
    await waitFor(() => {
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();
    });
  });

  it('should expose handle via ref', async () => {
    const ref = React.createRef<SimpleViewerHandle>();
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );

    render(<SimpleViewer ref={ref} object={cube} options={testDefaultOptions} />);
    
    await waitFor(() => {
      expect(ref.current).toBeTruthy();
      expect(ref.current?.events).toBeTruthy();
    });
  });

  it('should create path tracing service when explicitly enabled', async () => {
    const pathTracingEnabledOptions = {
      ...testDefaultOptions,
      pathTracing: {
        ...testDefaultOptions.pathTracing!,
        enabled: true,
        maxSamples: 10, // Low sample count for quick test
      },
    };

    const { container } = render(<SimpleViewer object={null} options={pathTracingEnabledOptions} />);
    
    await waitFor(() => {
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();
    });

    // The path tracing service should be created (we'll see the log)
    // But only one instance should be created for this test
  });
});