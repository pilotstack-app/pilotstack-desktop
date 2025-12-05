/**
 * IPC Validation Utility
 *
 * Provides secure IPC handler registration with automatic Zod validation.
 *
 * Reference: OPEN_SOURCE_ARCHITECTURE.md - IPC Security Hardening
 */

import { ipcMain, IpcMainInvokeEvent } from "electron";
import { z, ZodSchema, ZodError } from "zod";
import { logger } from "../utils/logger";

/**
 * Error thrown when IPC validation fails
 */
export class IPCValidationError extends Error {
  public readonly channel: string;
  public readonly issues: z.ZodIssue[];

  constructor(channel: string, issues: z.ZodIssue[]) {
    const issueMessages = issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    super(`IPC validation failed for ${channel}: ${issueMessages}`);
    this.name = "IPCValidationError";
    this.channel = channel;
    this.issues = issues;
  }
}

/**
 * Register an IPC handler with schema validation
 *
 * @param channel - The IPC channel name
 * @param schema - Zod schema for validating the payload
 * @param handler - Handler function that receives validated data
 *
 * @example
 * ```typescript
 * handleWithValidation(
 *   "capture:start",
 *   captureStartSchema,
 *   async (event, data) => {
 *     // data is typed and validated
 *     return captureManager.start(data.sourceId);
 *   }
 * );
 * ```
 */
export function handleWithValidation<T extends ZodSchema>(
  channel: string,
  schema: T,
  handler: (event: IpcMainInvokeEvent, data: z.infer<T>) => Promise<unknown> | unknown
): void {
  ipcMain.handle(channel, async (event, args) => {
    const result = schema.safeParse(args);

    if (!result.success) {
      logger.warn(`IPC validation failed: ${channel}`, {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        })),
      });
      throw new IPCValidationError(channel, result.error.issues);
    }

    return handler(event, result.data);
  });
}

/**
 * Register an IPC handler without validation (for channels with no arguments)
 *
 * @param channel - The IPC channel name
 * @param handler - Handler function
 *
 * @example
 * ```typescript
 * handleNoArgs("capture:stop", async (event) => {
 *   return captureManager.stop();
 * });
 * ```
 */
export function handleNoArgs(
  channel: string,
  handler: (event: IpcMainInvokeEvent) => Promise<unknown> | unknown
): void {
  ipcMain.handle(channel, handler);
}

/**
 * Register an IPC handler with simple type validation (single primitive)
 * Used for handlers that take a single string, number, etc.
 *
 * @param channel - The IPC channel name
 * @param schema - Zod schema for the single argument
 * @param handler - Handler function that receives validated data
 */
export function handleWithSimpleValidation<T extends ZodSchema>(
  channel: string,
  schema: T,
  handler: (event: IpcMainInvokeEvent, data: z.infer<T>) => Promise<unknown> | unknown
): void {
  ipcMain.handle(channel, async (event, args) => {
    const result = schema.safeParse(args);

    if (!result.success) {
      logger.warn(`IPC validation failed: ${channel}`, {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        })),
      });
      throw new IPCValidationError(channel, result.error.issues);
    }

    return handler(event, result.data);
  });
}

/**
 * Validate data against a schema without registering a handler
 * Useful for manual validation in complex handlers
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @param channel - Channel name for error reporting
 * @returns Validated and typed data
 * @throws IPCValidationError if validation fails
 */
export function validateIPCData<T extends ZodSchema>(
  schema: T,
  data: unknown,
  channel: string
): z.infer<T> {
  const result = schema.safeParse(data);

  if (!result.success) {
    logger.warn(`IPC validation failed: ${channel}`, {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      })),
    });
    throw new IPCValidationError(channel, result.error.issues);
  }

  return result.data;
}

/**
 * Create a safe handler wrapper that catches validation errors
 * and returns a standardized error response
 *
 * @param handler - The handler function to wrap
 * @returns Wrapped handler that returns error objects instead of throwing
 */
export function createSafeHandler<TArgs, TResult>(
  handler: (event: IpcMainInvokeEvent, args: TArgs) => Promise<TResult>
): (event: IpcMainInvokeEvent, args: TArgs) => Promise<TResult | { success: false; error: string }> {
  return async (event, args) => {
    try {
      return await handler(event, args);
    } catch (error) {
      if (error instanceof IPCValidationError) {
        return {
          success: false,
          error: `Validation error: ${error.message}`,
        };
      }
      if (error instanceof ZodError) {
        return {
          success: false,
          error: `Validation error: ${error.message}`,
        };
      }
      throw error; // Re-throw non-validation errors
    }
  };
}

/**
 * Type guard to check if a value is a ZodError
 */
export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

/**
 * Type guard to check if a value is an IPCValidationError
 */
export function isIPCValidationError(error: unknown): error is IPCValidationError {
  return error instanceof IPCValidationError;
}
