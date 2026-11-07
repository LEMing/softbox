import { Result } from '../Result';
import { ThreeViewerError, ErrorCode } from '../../errors';

describe('Result', () => {
  describe('ok', () => {
    it('should create a successful result', () => {
      const result = Result.ok('success');
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
    });

    it('should handle different value types', () => {
      const numberResult = Result.ok(42);
      const objectResult = Result.ok({ foo: 'bar' });
      const arrayResult = Result.ok([1, 2, 3]);
      
      expect(numberResult.ok).toBe(true);
      expect(objectResult.ok).toBe(true);
      expect(arrayResult.ok).toBe(true);
      
      if (numberResult.ok) expect(numberResult.value).toBe(42);
      if (objectResult.ok) expect(objectResult.value).toEqual({ foo: 'bar' });
      if (arrayResult.ok) expect(arrayResult.value).toEqual([1, 2, 3]);
    });
  });

  describe('err', () => {
    it('should create an error result', () => {
      const error = new ThreeViewerError('Test error', ErrorCode.UNKNOWN);
      const result = Result.err(error);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });

    it('should handle different error types', () => {
      const threeViewerError = new ThreeViewerError('Test', ErrorCode.INVALID_CONFIGURATION);
      const customError = { message: 'Custom error', code: 'CUSTOM' };
      
      const result1 = Result.err(threeViewerError);
      const result2 = Result.err(customError);
      
      expect(result1.ok).toBe(false);
      expect(result2.ok).toBe(false);
      
      if (!result1.ok) expect(result1.error).toBe(threeViewerError);
      if (!result2.ok) expect(result2.error).toBe(customError);
    });
  });

  describe('wrap', () => {
    it('should wrap successful function execution', () => {
      const result = Result.wrap(() => 'success');
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
    });

    it('should wrap function that returns complex value', () => {
      const complexFn = () => ({
        data: [1, 2, 3],
        metadata: { count: 3 }
      });
      
      const result = Result.wrap(complexFn);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({
          data: [1, 2, 3],
          metadata: { count: 3 }
        });
      }
    });

    it('should catch and wrap ThreeViewerError', () => {
      const error = new ThreeViewerError('Test error', ErrorCode.RENDERER_INIT_FAILED);
      const result = Result.wrap(() => {
        throw error;
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
        expect(result.error.code).toBe(ErrorCode.RENDERER_INIT_FAILED);
      }
    });

    it('should wrap regular errors as ThreeViewerError', () => {
      const result = Result.wrap(() => {
        throw new Error('Regular error');
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ThreeViewerError);
        expect(result.error.message).toBe('Error: Regular error');
        expect(result.error.code).toBe(ErrorCode.UNKNOWN);
        expect(result.error.context?.originalError).toBeInstanceOf(Error);
      }
    });

    it('should wrap string errors', () => {
      const result = Result.wrap(() => {
        throw 'String error';
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ThreeViewerError);
        expect(result.error.message).toBe('String error');
        expect(result.error.code).toBe(ErrorCode.UNKNOWN);
      }
    });

    it('should wrap non-standard errors', () => {
      const result = Result.wrap(() => {
        throw { custom: 'error', value: 42 };
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ThreeViewerError);
        expect(result.error.message).toBe('[object Object]');
        expect(result.error.code).toBe(ErrorCode.UNKNOWN);
        expect(result.error.context?.originalError).toEqual({ custom: 'error', value: 42 });
      }
    });
  });

  describe('type guards', () => {
    it('should narrow types correctly with ok check', () => {
      const successResult: Result<string> = Result.ok('value');
      const errorResult: Result<string> = Result.err(new ThreeViewerError('Error', ErrorCode.UNKNOWN));
      
      if (successResult.ok) {
        // TypeScript should know this is the success case
        const value: string = successResult.value;
        expect(value).toBe('value');
      }
      
      if (!errorResult.ok) {
        // TypeScript should know this is the error case
        const error: ThreeViewerError = errorResult.error;
        expect(error.message).toBe('Error');
      }
    });
  });
});