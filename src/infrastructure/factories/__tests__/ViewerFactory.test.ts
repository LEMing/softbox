import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MapControls } from 'three/examples/jsm/controls/MapControls';
import { ViewerFactory, ExtendedModelLoaderFactory } from '../ViewerFactory';
import { ViewerRenderer, ViewerRendererOptions } from '../../../core/rendering/ViewerRenderer';
import { Result } from '../../../utils/Result';
import { SimpleViewerOptions } from '../../../types/SimpleViewerOptions';
import { ControlType } from '../../../types/options';

describe('ViewerFactory preserveDrawingBuffer', () => {
  let initSpy: jest.SpyInstance;

  beforeEach(() => {
    initSpy = jest
      .spyOn(ViewerRenderer.prototype, 'initialize')
      .mockReturnValue(Result.ok(undefined));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    initSpy.mockRestore();
    jest.restoreAllMocks();
  });

  const capturedOptions = async (options: SimpleViewerOptions): Promise<ViewerRendererOptions> => {
    const viewer = ViewerFactory.createViewer(document.createElement('canvas'), options);
    await viewer.initialize();
    viewer.dispose();
    return initSpy.mock.calls[0][0] as ViewerRendererOptions;
  };

  it('preserves the drawing buffer even with path tracing off (it can be enabled at runtime)', async () => {
    const opts = await capturedOptions({});
    expect(opts.preserveDrawingBuffer).toBe(true);
  });

  it('preserves the drawing buffer when path tracing starts enabled', async () => {
    const opts = await capturedOptions({ pathTracing: { enabled: true } });
    expect(opts.preserveDrawingBuffer).toBe(true);
  });

  it('preserves the drawing buffer when replaceWithScreenshotOnComplete is set', async () => {
    const opts = await capturedOptions({ replaceWithScreenshotOnComplete: true });
    expect(opts.preserveDrawingBuffer).toBe(true);
  });
});

describe('ViewerFactory selection.bvh threading', () => {
  let loaderSpy: jest.SpyInstance;

  beforeEach(() => {
    jest
      .spyOn(ViewerRenderer.prototype, 'initialize')
      .mockReturnValue(Result.ok(undefined));
    loaderSpy = jest.spyOn(ExtendedModelLoaderFactory.prototype, 'createDefaultLoader');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('threads selection.bvh: false into the model loader', () => {
    ViewerFactory.createViewer(document.createElement('canvas'), { selection: { bvh: false } });
    expect(loaderSpy).toHaveBeenCalledWith(expect.objectContaining({ bvh: false }));
  });

  it('leaves the loader BVH default on when selection is not set', () => {
    ViewerFactory.createViewer(document.createElement('canvas'), {});
    expect(loaderSpy).toHaveBeenCalledWith(expect.objectContaining({ bvh: undefined }));
  });
});

describe('ViewerFactory units validation', () => {
  it('rejects an unknown units string before allocating any resource', () => {
    const rendererConstructed = jest.spyOn(ViewerRenderer.prototype, 'initialize');
    const canvas = document.createElement('canvas');
    const addListener = jest.spyOn(canvas, 'addEventListener');

    expect(() =>
      ViewerFactory.createViewer(canvas, {
        units: 'furlongs' as unknown as SimpleViewerOptions['units'],
      })
    ).toThrow(/furlongs/);

    expect(addListener).not.toHaveBeenCalled();
    expect(rendererConstructed).not.toHaveBeenCalled();
    rendererConstructed.mockRestore();
    addListener.mockRestore();
  });
});

describe('ViewerFactory scene assembly', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds a THREE scene and a perspective camera from the camera options', () => {
    const viewer = ViewerFactory.createViewer(document.createElement('canvas'), {
      camera: { fov: 45, near: 0.5, far: 500, position: [1, 2, 3], target: [0, 1, 0] },
    } as SimpleViewerOptions);

    const camera = viewer.getCamera();
    expect(viewer.getScene()).toBeInstanceOf(THREE.Scene);
    expect(camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(camera.fov).toBe(45);
    expect(camera.near).toBe(0.5);
    expect(camera.far).toBe(500);
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const towardTarget = new THREE.Vector3(-1, -1, -3).normalize();
    expect(direction.distanceTo(towardTarget)).toBeLessThan(1e-6);
  });

  it('falls back to the default camera frustum when no camera options are given', () => {
    const camera = ViewerFactory.createViewer(document.createElement('canvas'), {}).getCamera();
    expect(camera.fov).toBe(30);
    expect(camera.near).toBe(0.1);
    expect(camera.far).toBe(100000);
  });

  it('builds orbit controls by default and applies the control options', () => {
    const viewer = ViewerFactory.createViewer(document.createElement('canvas'), {
      controls: {
        autoRotate: true,
        autoRotateSpeed: 3,
        minDistance: 1,
        maxDistance: 9,
        minPolarAngle: 0.1,
        maxPolarAngle: 1.2,
      },
    });

    const controls = viewer.getControls();
    expect(OrbitControls).toHaveBeenCalledWith(viewer.getCamera(), expect.any(HTMLCanvasElement));
    expect(controls).toMatchObject({
      enabled: true,
      enableDamping: true,
      dampingFactor: 0.25,
      enableZoom: true,
      enableRotate: true,
      enablePan: true,
      autoRotate: true,
      autoRotateSpeed: 3,
      minDistance: 1,
      maxDistance: 9,
      minPolarAngle: 0.1,
      maxPolarAngle: 1.2,
    });
  });

  it('builds map controls that pan in screen space when asked for map controls', () => {
    const viewer = ViewerFactory.createViewer(document.createElement('canvas'), {
      controls: { type: ControlType.MapControls },
    });

    expect(MapControls).toHaveBeenCalled();
    expect(viewer.getControls().screenSpacePanning).toBe(true);
  });

  it('points the controls at the camera target', () => {
    const viewer = ViewerFactory.createViewer(document.createElement('canvas'), {
      camera: { target: [4, 5, 6] },
    } as SimpleViewerOptions);

    const controls = viewer.getControls();
    expect(controls.target.set).toHaveBeenCalledWith(4, 5, 6);
    expect(controls.update).toHaveBeenCalled();
  });

  it('hands the viewer a renderer that is not initialized until the viewer initializes', () => {
    const viewer = ViewerFactory.createViewer(document.createElement('canvas'), {});
    expect(viewer.getRenderer()).toBeInstanceOf(ViewerRenderer);
    expect(viewer.getRenderer().getWebGLRenderer()).toBeNull();
  });
});
