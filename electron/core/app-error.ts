/**
 * Application Error Hierarchy
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Refactoring Recommendations §5
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Known Issues §4 - Error Handling
 * 
 * Standardized error handling with error class hierarchy.
 * All application errors should extend from AppError.
 */

/**
 * Base application error class
 * 
 * Provides standardized error structure with error codes, status codes, and cause tracking.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly cause?: Error,
    public readonly metadata?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    
    // Capture stack trace if available (Node.js/V8 feature)
    // TypeScript doesn't recognize captureStackTrace, so we use type assertion
    const ErrorConstructor = Error as any;
    if (typeof ErrorConstructor.captureStackTrace === "function") {
      ErrorConstructor.captureStackTrace(this, this.constructor);
    }
    
    // Maintain proper prototype chain
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Convert error to JSON for IPC/serialization
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
      } : undefined,
      metadata: this.metadata,
    };
  }

  /**
   * Check if error is of a specific type
   */
  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }
}

/**
 * Capture-related errors
 */
export class CaptureError extends AppError {
  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(message, "CAPTURE_ERROR", 500, cause, metadata);
    Object.setPrototypeOf(this, CaptureError.prototype);
  }
}

/**
 * Video generation errors
 */
export class VideoError extends AppError {
  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(message, "VIDEO_ERROR", 500, cause, metadata);
    Object.setPrototypeOf(this, VideoError.prototype);
  }
}

/**
 * Upload errors
 */
export class UploadError extends AppError {
  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(message, "UPLOAD_ERROR", 500, cause, metadata);
    Object.setPrototypeOf(this, UploadError.prototype);
  }
}

/**
 * Authentication errors
 */
export class AuthError extends AppError {
  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(message, "AUTH_ERROR", 401, cause, metadata);
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

/**
 * Configuration errors
 */
export class ConfigError extends AppError {
  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(message, "CONFIG_ERROR", 500, cause, metadata);
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

/**
 * Session errors
 */
export class SessionError extends AppError {
  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(message, "SESSION_ERROR", 500, cause, metadata);
    Object.setPrototypeOf(this, SessionError.prototype);
  }
}

/**
 * IPC errors
 */
export class IPCError extends AppError {
  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(message, "IPC_ERROR", 500, cause, metadata);
    Object.setPrototypeOf(this, IPCError.prototype);
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(message, "VALIDATION_ERROR", 400, cause, metadata);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Network errors
 */
export class NetworkError extends AppError {
  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(message, "NETWORK_ERROR", 503, cause, metadata);
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * File system errors
 */
export class FileSystemError extends AppError {
  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(message, "FILE_SYSTEM_ERROR", 500, cause, metadata);
    Object.setPrototypeOf(this, FileSystemError.prototype);
  }
}

