/**
 * Enhanced error handling with security considerations
 */

import { sanitizeErrorMessage } from './security.js';

export interface MCPError extends Error {
  code: string;
  retryable: boolean;
  timestamp: Date;
}

/**
 * Create a standardized error with security measures
 */
export function createError(
  message: string,
  code: string = "UNKNOWN_ERROR",
  retryable: boolean = false
): MCPError {
  // Sanitize the error message to remove sensitive information
  const sanitizedMessage = sanitizeErrorMessage(message);
  
  const error = new Error(sanitizedMessage) as MCPError;
  error.code = code;
  error.retryable = retryable;
  error.timestamp = new Date();
  
  // Log error for debugging (without sensitive info)
  console.error(`[${code}] ${sanitizedMessage}`, {
    retryable,
    timestamp: error.timestamp.toISOString()
  });
  
  return error;
}

/**
 * Error categories for better handling
 */
export const ERROR_CATEGORIES = {
  // Security-related errors
  SECURITY: {
    RATE_LIMITED: { retryable: true, severity: 'warning' },
    INVALID_INPUT: { retryable: false, severity: 'error' },
    PATH_TRAVERSAL: { retryable: false, severity: 'critical' },
    INJECTION_ATTEMPT: { retryable: false, severity: 'critical' }
  },
  
  // Application errors
  APPLICATION: {
    APP_NOT_RUNNING: { retryable: true, severity: 'warning' },
    NO_WINDOW: { retryable: true, severity: 'warning' },
    INTERACTION_FAILED: { retryable: true, severity: 'error' },
    EMPTY_RESPONSE: { retryable: true, severity: 'warning' }
  },
  
  // System errors
  SYSTEM: {
    FILE_NOT_FOUND: { retryable: false, severity: 'error' },
    PERMISSION_DENIED: { retryable: false, severity: 'error' },
    DISK_FULL: { retryable: false, severity: 'critical' },
    NETWORK_ERROR: { retryable: true, severity: 'warning' }
  }
} as const;

/**
 * Get error category and metadata
 */
export function getErrorMetadata(code: string) {
  for (const [category, errors] of Object.entries(ERROR_CATEGORIES)) {
    if (code in errors) {
      return {
        category,
        ...(errors as any)[code]
      };
    }
  }
  
  return {
    category: 'UNKNOWN',
    retryable: false,
    severity: 'error'
  };
}

/**
 * Enhanced error formatter for user-facing messages
 */
export function formatUserError(error: MCPError): string {
  const metadata = getErrorMetadata(error.code);
  
  switch (error.code) {
    case 'RATE_LIMITED':
      return 'Too many requests. Please wait a moment before trying again.';
    
    case 'INVALID_INPUT':
      return 'Invalid input provided. Please check your request and try again.';
    
    case 'PATH_TRAVERSAL':
      return 'Invalid file path. Please use a path within the allowed directory.';
    
    case 'APP_NOT_RUNNING':
      return 'ChatGPT application is not running. Please start the ChatGPT desktop app.';
    
    case 'NO_WINDOW':
      return 'No ChatGPT window found. Please ensure the ChatGPT app is open and visible.';
    
    case 'INTERACTION_FAILED':
      return 'Failed to interact with ChatGPT. Please try again.';
    
    case 'EMPTY_RESPONSE':
      return 'Received empty response from ChatGPT. Please try your request again.';
    
    case 'FILE_NOT_FOUND':
      return 'File not found. Please check the file path and try again.';
    
    case 'PERMISSION_DENIED':
      return 'Permission denied. Please check file permissions or run with appropriate access.';
    
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Log error with appropriate level based on severity
 */
export function logError(error: MCPError): void {
  const metadata = getErrorMetadata(error.code);
  const logEntry = {
    code: error.code,
    message: error.message,
    category: metadata.category,
    severity: metadata.severity,
    retryable: error.retryable,
    timestamp: error.timestamp.toISOString()
  };
  
  switch (metadata.severity) {
    case 'critical':
      console.error('CRITICAL ERROR:', logEntry);
      break;
    case 'error':
      console.error('ERROR:', logEntry);
      break;
    case 'warning':
      console.warn('WARNING:', logEntry);
      break;
    default:
      console.log('INFO:', logEntry);
  }
}

/**
 * Wrap function with enhanced error handling
 */
export function withErrorHandling<T extends (...args: any[]) => any>(
  fn: T,
  context: string = 'unknown'
): T {
  return ((...args: Parameters<T>) => {
    try {
      const result = fn(...args);
      
      // Handle async functions
      if (result instanceof Promise) {
        return result.catch((error) => {
          const mcpError = error instanceof Error && 'code' in error 
            ? error as MCPError
            : createError(
                `Error in ${context}: ${sanitizeErrorMessage(error)}`,
                'WRAPPED_ERROR',
                false
              );
          
          logError(mcpError);
          throw mcpError;
        });
      }
      
      return result;
    } catch (error) {
      const mcpError = error instanceof Error && 'code' in error 
        ? error as MCPError
        : createError(
            `Error in ${context}: ${sanitizeErrorMessage(error)}`,
            'WRAPPED_ERROR',
            false
          );
      
      logError(mcpError);
      throw mcpError;
    }
  }) as T;
}

/**
 * Validate and sanitize error before throwing
 */
export function safeThrow(error: unknown, fallbackMessage: string = 'An error occurred'): never {
  if (error instanceof Error && 'code' in error) {
    throw error as MCPError;
  }
  
  throw createError(
    sanitizeErrorMessage(error) || fallbackMessage,
    'SAFE_THROW_ERROR',
    false
  );
}
