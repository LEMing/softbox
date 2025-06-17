import { get2DContext } from '../get2DContext';

describe('get2DContext', () => {
  it('should return 2D context when available', () => {
    const mockCanvas = document.createElement('canvas');
    const mockContext = {} as CanvasRenderingContext2D;
    
    jest.spyOn(mockCanvas, 'getContext').mockReturnValue(mockContext);
    
    const result = get2DContext(mockCanvas);
    
    expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
    expect(result).toBe(mockContext);
  });

  it('should throw error when 2D context is not available', () => {
    const mockCanvas = document.createElement('canvas');
    
    jest.spyOn(mockCanvas, 'getContext').mockReturnValue(null);
    
    expect(() => {
      get2DContext(mockCanvas);
    }).toThrow('Canvas 2d context is not supported');
  });

  it('should throw error with correct message', () => {
    const mockCanvas = document.createElement('canvas');
    
    jest.spyOn(mockCanvas, 'getContext').mockReturnValue(null);
    
    try {
      get2DContext(mockCanvas);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Canvas 2d context is not supported');
    }
  });
});