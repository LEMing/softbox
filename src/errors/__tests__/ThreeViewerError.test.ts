import { ThreeViewerError, ErrorCode } from '../';

describe('ThreeViewerError', () => {
  describe('constructor', () => {
    it('should create error with message and code', () => {
      const error = new ThreeViewerError('Test error', ErrorCode.MODEL_LOAD_FAILED);
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.MODEL_LOAD_FAILED);
      expect(error.name).toBe('ThreeViewerError');
      expect(error.timestamp).toBeInstanceOf(Date);
    });
    
    it('should include context when provided', () => {
      const context = { url: 'test.glb', attempt: 1 };
      const error = new ThreeViewerError(
        'Failed to load',
        ErrorCode.MODEL_LOAD_FAILED,
        context
      );
      
      expect(error.context).toEqual(context);
    });
    
    it('should have proper stack trace', () => {
      const error = new ThreeViewerError('Test', ErrorCode.MODEL_LOAD_FAILED);
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ThreeViewerError');
    });
  });
  
  describe('fromError', () => {
    it('should return existing ThreeViewerError unchanged', () => {
      const original = new ThreeViewerError('Original', ErrorCode.RENDER_ERROR);
      const result = ThreeViewerError.fromError(original, ErrorCode.MODEL_LOAD_FAILED);
      
      expect(result).toBe(original);
    });
    
    it('should convert Error to ThreeViewerError', () => {
      const jsError = new Error('JavaScript error');
      const result = ThreeViewerError.fromError(jsError, ErrorCode.MODEL_LOAD_FAILED);
      
      expect(result).toBeInstanceOf(ThreeViewerError);
      expect(result.message).toBe('JavaScript error');
      expect(result.code).toBe(ErrorCode.MODEL_LOAD_FAILED);
      expect(result.context?.originalError).toMatchObject({
        name: 'Error',
        message: 'JavaScript error',
      });
    });
    
    it('should convert string to ThreeViewerError', () => {
      const result = ThreeViewerError.fromError('String error', ErrorCode.RENDER_ERROR);
      
      expect(result).toBeInstanceOf(ThreeViewerError);
      expect(result.message).toBe('String error');
      expect(result.context?.originalError).toBe('String error');
    });
    
    it('should merge provided context', () => {
      const jsError = new Error('Test');
      const context = { component: 'CameraManager' };
      const result = ThreeViewerError.fromError(
        jsError,
        ErrorCode.CAMERA_INIT_FAILED,
        context
      );
      
      expect(result.context).toMatchObject({
        component: 'CameraManager',
        originalError: expect.objectContaining({
          message: 'Test',
        }),
      });
    });
  });
  
});