/**
 * Security utilities for input sanitization and validation
 */

import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Sanitize string for safe AppleScript injection
 */
export function sanitizeForAppleScript(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input for AppleScript sanitization');
  }

  return input
    .replace(/\\/g, '\\\\')     // Escape backslashes first
    .replace(/"/g, '\\"')       // Escape quotes
    .replace(/'/g, "\\'")       // Escape single quotes
    .replace(/\n/g, '\\n')      // Escape newlines
    .replace(/\r/g, '\\r')      // Escape carriage returns
    .replace(/\t/g, '\\t')      // Escape tabs
    .replace(/\0/g, '')         // Remove null characters
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
}

/**
 * Validate and normalize file path to prevent path traversal
 */
export function validateSavePath(customPath: string, allowedBaseDir: string): string {
  if (!customPath || typeof customPath !== 'string') {
    throw new Error('Invalid file path provided');
  }

  if (!allowedBaseDir || typeof allowedBaseDir !== 'string') {
    throw new Error('Invalid base directory provided');
  }

  // Remove any null bytes and normalize path
  const cleanPath = customPath.replace(/\0/g, '');
  
  // Resolve paths to absolute form
  const resolvedPath = path.resolve(cleanPath);
  const allowedPath = path.resolve(allowedBaseDir);
  
  // Check if the resolved path is within the allowed directory
  if (!resolvedPath.startsWith(allowedPath + path.sep) && resolvedPath !== allowedPath) {
    throw new Error(`Path traversal detected: ${customPath} is outside allowed directory`);
  }

  // Additional validation: ensure it's a reasonable file path
  const fileName = path.basename(resolvedPath);
  if (!fileName || fileName.startsWith('.') || fileName.length > 255) {
    throw new Error(`Invalid filename: ${fileName}`);
  }

  // Validate file extension (allow common image formats)
  const ext = path.extname(fileName).toLowerCase();
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
  if (ext && !allowedExtensions.includes(ext)) {
    throw new Error(`Invalid file extension: ${ext}`);
  }

  return resolvedPath;
}

/**
 * Rate limiting utility
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if request is allowed under rate limit
   */
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    
    return true;
  }

  /**
   * Get remaining requests for identifier
   */
  getRemainingRequests(identifier: string): number {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    return Math.max(0, this.maxRequests - validRequests.length);
  }
}

// Global rate limiter instance
export const globalRateLimiter = new RateLimiter(5, 60000); // 5 requests per minute

/**
 * Validate directory exists and is writable
 */
export async function validateDirectory(dirPath: string): Promise<void> {
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }
    
    // Test write permissions by creating a temporary file
    const testFile = path.join(dirPath, '.write_test_' + Date.now());
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }
    if (error instanceof Error && error.message.includes('EACCES')) {
      throw new Error(`No write permission for directory: ${dirPath}`);
    }
    throw error;
  }
}

/**
 * Sanitize error messages to remove sensitive information
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error occurred';
  
  const message = error instanceof Error ? error.message : String(error);
  
  // Remove common sensitive patterns
  return message
    .replace(/\/Users\/[^\/\s]+/g, '/Users/***')  // Hide username in paths
    .replace(/\/home\/[^\/\s]+/g, '/home/***')    // Hide username in Linux paths
    .replace(/password[=:]\s*\S+/gi, 'password=***')  // Hide passwords
    .replace(/token[=:]\s*\S+/gi, 'token=***')        // Hide tokens
    .replace(/key[=:]\s*\S+/gi, 'key=***');           // Hide keys
}
