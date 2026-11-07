import { ThreeViewerError, ErrorCode } from '../errors';

export type Result<T, E = ThreeViewerError> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Result = {
  ok<T>(value: T): Result<T> {
    return { ok: true, value };
  },
  
  err<E>(error: E): Result<never, E> {
    return { ok: false, error };
  },
  
  wrap<T>(fn: () => T): Result<T> {
    try {
      return Result.ok(fn());
    } catch (error) {
      return Result.err(
        error instanceof ThreeViewerError 
          ? error 
          : new ThreeViewerError(
              String(error),
              ErrorCode.UNKNOWN,
              { originalError: error }
            )
      );
    }
  }
};