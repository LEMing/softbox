import { ErrorCode } from './ErrorCode';

export interface ErrorContext {
  [key: string]: any;
}

export class ThreeViewerError extends Error {
  public readonly timestamp: Date;
  
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly context?: ErrorContext
  ) {
    super(message);
    this.name = 'ThreeViewerError';
    this.timestamp = new Date();
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ThreeViewerError);
    }
  }
  
  static fromError(error: unknown, code: ErrorCode, context?: ErrorContext): ThreeViewerError {
    if (error instanceof ThreeViewerError) {
      return error;
    }
    
    const message = error instanceof Error 
      ? error.message 
      : String(error);
      
    const errorContext = {
      ...context,
      originalError: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    };
    
    return new ThreeViewerError(message, code, errorContext);
  }
}