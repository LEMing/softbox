import * as THREE from 'three';
import { createGradientBackground } from '../createGradientBackground';
import { get2DContext } from '../get2DContext';

// Mock get2DContext
jest.mock('../get2DContext');

describe('createGradientBackground', () => {
  let mockScene: THREE.Scene;
  let mockContext: CanvasRenderingContext2D;
  let mockCanvas: HTMLCanvasElement;
  let mockGradient: CanvasGradient;
  let mockImageData: ImageData;

  beforeEach(() => {
    // Setup mock scene
    mockScene = new THREE.Scene();
    
    // Setup mock canvas and context
    mockCanvas = document.createElement('canvas');
    mockImageData = {
      data: new Uint8ClampedArray(100), // 25 pixels * 4 channels
      width: 5,
      height: 5
    } as ImageData;
    
    mockGradient = {} as CanvasGradient;
    mockGradient.addColorStop = jest.fn();
    
    mockContext = {
      fillStyle: '',
      filter: '',
      fillRect: jest.fn(),
      getImageData: jest.fn(() => mockImageData),
      putImageData: jest.fn(),
      createRadialGradient: jest.fn(() => mockGradient),
      drawImage: jest.fn(),
    } as any;
    
    (get2DContext as jest.Mock).mockReturnValue(mockContext);
    
    // Mock document.createElement for canvas
    jest.spyOn(document, 'createElement').mockReturnValue(mockCanvas);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should create a gradient background with specified size', () => {
    const size = new THREE.Vector2(800, 600);
    
    createGradientBackground(mockScene, size);
    
    expect(mockCanvas.width).toBe(800);
    expect(mockCanvas.height).toBe(600);
    expect(get2DContext).toHaveBeenCalledWith(mockCanvas);
  });

  it('should fill canvas with base color', () => {
    const size = new THREE.Vector2(800, 600);
    
    createGradientBackground(mockScene, size);
    
    // fillRect should be called at least once for base color
    expect(mockContext.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });

  it('should add noise to the image data', () => {
    const size = new THREE.Vector2(2, 2); // Small size for testing
    const data = new Uint8ClampedArray(16); // 2x2 pixels * 4 channels
    mockImageData = {
      data: data,
      width: 2,
      height: 2
    } as ImageData;
    
    // Mock Math.random to return predictable values
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    
    createGradientBackground(mockScene, size);
    
    expect(mockContext.getImageData).toHaveBeenCalledWith(0, 0, 2, 2);
    expect(mockContext.putImageData).toHaveBeenCalledWith(mockImageData, 0, 0);
    
    // Check that noise was applied
    const expectedNoise = 0.5 * 300; // NOISE_INTENSITY = 300
    expect(data[0]).toBe(expectedNoise); // R
    expect(data[1]).toBe(expectedNoise); // G
    expect(data[2]).toBe(expectedNoise); // B
    expect(data[3]).toBe(250); // Alpha (NOISE_OPACITY)
    
    mockRandom.mockRestore();
  });

  it('should apply blur filter', () => {
    const size = new THREE.Vector2(800, 600);
    
    createGradientBackground(mockScene, size);
    
    // Check blur was applied and removed
    expect(mockContext.filter).toBe('none');
    expect(mockContext.drawImage).toHaveBeenCalledWith(mockCanvas, 0, 0);
  });

  it('should create radial gradient with correct parameters', () => {
    const size = new THREE.Vector2(800, 600);
    
    createGradientBackground(mockScene, size);
    
    expect(mockContext.createRadialGradient).toHaveBeenCalledWith(
      400, 300, 10,      // Center x, y, start radius (GRADIENT_CENTER_RADIUS = 10)
      400, 300, 450      // Center x, y, end radius (600 * 0.75)
    );
    
    expect(mockGradient.addColorStop).toHaveBeenCalledTimes(2);
    expect(mockGradient.addColorStop).toHaveBeenCalledWith(0, 'rgba(34, 34, 34, 0.95)');
    expect(mockGradient.addColorStop).toHaveBeenCalledWith(1, 'rgba(0, 0, 0, 1)');
  });

  it('should apply gradient over noise', () => {
    const size = new THREE.Vector2(800, 600);
    
    createGradientBackground(mockScene, size);
    
    // Check that gradient was set as fill style
    expect(mockContext.fillStyle).toBe(mockGradient);
    // Check that fillRect was called twice (once for base, once for gradient)
    expect(mockContext.fillRect).toHaveBeenCalledTimes(2);
    expect(mockContext.fillRect).toHaveBeenNthCalledWith(2, 0, 0, 800, 600);
  });

  it('should create texture with correct settings', () => {
    const size = new THREE.Vector2(800, 600);
    
    createGradientBackground(mockScene, size);
    
    // Check that scene background is set to a CanvasTexture
    expect(mockScene.background).toBeInstanceOf(THREE.CanvasTexture);
    
    const texture = mockScene.background as THREE.CanvasTexture;
    expect(texture.minFilter).toBe(THREE.LinearFilter);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
  });

  it('should set texture as scene background', () => {
    const size = new THREE.Vector2(800, 600);
    
    createGradientBackground(mockScene, size);
    
    expect(mockScene.background).toBeInstanceOf(THREE.CanvasTexture);
  });

  it('should handle different canvas sizes', () => {
    const sizes = [
      new THREE.Vector2(100, 100),
      new THREE.Vector2(1920, 1080),
      new THREE.Vector2(500, 1000),
    ];
    
    sizes.forEach(size => {
      mockScene.background = null;
      createGradientBackground(mockScene, size);
      
      expect(mockCanvas.width).toBe(size.x);
      expect(mockCanvas.height).toBe(size.y);
      expect(mockContext.createRadialGradient).toHaveBeenCalledWith(
        size.x / 2, size.y / 2, 10,
        size.x / 2, size.y / 2, size.y * 0.75
      );
    });
  });
});