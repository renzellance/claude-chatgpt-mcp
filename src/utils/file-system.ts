/**
 * File system utilities for image download and management - SECURITY HARDENED
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { CONFIG } from '../core/config.js';
import { runAppleScript } from './applescript.js';
import { 
  sanitizeForAppleScript, 
  validateSavePath, 
  globalRateLimiter, 
  validateDirectory,
  sanitizeErrorMessage 
} from './security.js';

/**
 * Ensure the download directory exists
 */
export function ensureDownloadDirectory(): void {
  try {
    const fs = require('fs');
    if (!fs.existsSync(CONFIG.image.downloadPath)) {
      fs.mkdirSync(CONFIG.image.downloadPath, { recursive: true });
    }
  } catch (error) {
    console.warn(`Failed to create download directory: ${sanitizeErrorMessage(error)}`);
  }
}

/**
 * Download image from ChatGPT UI - SECURITY HARDENED
 */
export async function downloadImageFromChatGPT(savePath?: string): Promise<{ success: boolean; imagePath?: string; error?: string }> {
  
  // Rate limiting check
  const rateLimitKey = 'image_download';
  if (!globalRateLimiter.isAllowed(rateLimitKey)) {
    return {
      success: false,
      error: `Rate limit exceeded. ${globalRateLimiter.getRemainingRequests(rateLimitKey)} requests remaining.`
    };
  }

  try {
    // Validate and prepare paths
    const timestamp = Date.now();
    const filename = `chatgpt_image_${timestamp}.png`;
    
    let targetPath: string;
    
    if (savePath) {
      // Validate custom path against path traversal
      targetPath = validateSavePath(savePath, CONFIG.image.downloadPath);
    } else {
      // Use default secure path
      targetPath = path.join(CONFIG.image.downloadPath, filename);
    }

    // Ensure directory exists and is writable
    const targetDir = path.dirname(targetPath);
    await validateDirectory(targetDir);

    // Sanitize the path for AppleScript injection
    const sanitizedPath = sanitizeForAppleScript(targetPath);

    const script = `
      tell application "ChatGPT"
        activate
        delay 0.5
        
        tell application "System Events"
          tell process "ChatGPT"
            -- Look for the most recent image in the conversation
            set imageElements to (every image of window 1)
            if (count of imageElements) > 0 then
              -- Get the last (most recent) image
              set lastImage to item -1 of imageElements
              
              -- Right-click to open context menu
              perform action "AXShowMenu" of lastImage
              delay 0.3
              
              -- Look for download/save option
              try
                click menu item "Save image" of menu 1
              on error
                try
                  click menu item "Download image" of menu 1
                on error
                  try
                    click menu item "Save Image As..." of menu 1
                  on error
                    return "No save option found"
                  end try
                end try
              end try
              
              delay 1
              
              -- Handle save dialog if it appears
              try
                -- Type the target path (now properly sanitized)
                keystroke "${sanitizedPath}"
                delay 0.5
                
                -- Press Enter to save
                key code 36 -- Enter key
                delay 1
                
                return "Image saved successfully"
              on error
                return "Save dialog handling failed"
              end try
            else
              return "No images found in conversation"
            end if
          end tell
        end tell
      end tell
    `;

    const result = await runAppleScript(script);

    if (result.success && result.data && result.data.includes('Image saved successfully')) {
      // Verify the file actually exists and has reasonable size
      try {
        await fs.access(targetPath);
        const stats = await fs.stat(targetPath);
        
        // Basic file validation
        if (stats.size === 0) {
          await fs.unlink(targetPath); // Clean up empty file
          return {
            success: false,
            error: "Downloaded file is empty"
          };
        }
        
        if (stats.size > 50 * 1024 * 1024) { // 50MB limit
          await fs.unlink(targetPath); // Clean up oversized file
          return {
            success: false,
            error: "Downloaded file exceeds size limit"
          };
        }

        return {
          success: true,
          imagePath: targetPath
        };
      } catch (fileError) {
        return {
          success: false,
          error: "File verification failed"
        };
      }
    }

    return {
      success: false,
      error: sanitizeErrorMessage(result.error || result.data || "Unknown error")
    };
    
  } catch (error) {
    return {
      success: false,
      error: sanitizeErrorMessage(error)
    };
  }
}

/**
 * Clean up old files in the download directory - INPUT VALIDATED
 */
export async function cleanupFiles(directory: string, maxAgeHours: number = 24): Promise<void> {
  try {
    // Validate input parameters
    if (typeof directory !== 'string' || !directory.trim()) {
      throw new Error('Invalid directory parameter');
    }
    
    if (typeof maxAgeHours !== 'number' || maxAgeHours < 0 || maxAgeHours > 8760) { // Max 1 year
      throw new Error('Invalid maxAgeHours parameter');
    }

    // Validate directory is within allowed bounds
    const resolvedDir = path.resolve(directory);
    const allowedDir = path.resolve(CONFIG.image.downloadPath);
    
    if (!resolvedDir.startsWith(allowedDir)) {
      throw new Error('Directory cleanup outside allowed path');
    }

    const files = await fs.readdir(resolvedDir);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(resolvedDir, file);
      try {
        const stats = await fs.stat(filePath);
        
        // Only clean up files, not directories
        if (stats.isFile() && (now - stats.mtime.getTime() > maxAge)) {
          await fs.unlink(filePath);
          console.log(`Cleaned up old file: ${path.basename(filePath)}`); // Don't log full path
        }
      } catch (error) {
        console.warn(`Failed to cleanup file: ${sanitizeErrorMessage(error)}`);
      }
    }
  } catch (error) {
    console.warn(`Cleanup failed: ${sanitizeErrorMessage(error)}`);
  }
}

/**
 * Get file size in MB - INPUT VALIDATED
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      return 0;
    }
    
    // Validate path is within allowed directory
    const resolvedPath = path.resolve(filePath);
    const allowedDir = path.resolve(CONFIG.image.downloadPath);
    
    if (!resolvedPath.startsWith(allowedDir)) {
      return 0;
    }

    const stats = await fs.stat(resolvedPath);
    return stats.size / (1024 * 1024);
  } catch {
    return 0;
  }
}

/**
 * Check if directory size exceeds limit and clean if needed - SECURITY HARDENED
 */
export async function checkDirectorySize(directory: string, maxSizeMB: number = 100): Promise<void> {
  try {
    // Input validation
    if (typeof directory !== 'string' || !directory.trim()) {
      throw new Error('Invalid directory parameter');
    }
    
    if (typeof maxSizeMB !== 'number' || maxSizeMB < 1 || maxSizeMB > 10000) { // Max 10GB
      throw new Error('Invalid maxSizeMB parameter');
    }

    // Validate directory is within allowed bounds
    const resolvedDir = path.resolve(directory);
    const allowedDir = path.resolve(CONFIG.image.downloadPath);
    
    if (!resolvedDir.startsWith(allowedDir)) {
      throw new Error('Directory size check outside allowed path');
    }

    const files = await fs.readdir(resolvedDir);
    let totalSize = 0;

    const fileStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(resolvedDir, file);
        try {
          const stats = await fs.stat(filePath);
          if (stats.isFile()) { // Only count files, not directories
            totalSize += stats.size;
            return { path: filePath, mtime: stats.mtime, size: stats.size };
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    const validFileStats = fileStats.filter(stat => stat !== null) as Array<{
      path: string;
      mtime: Date;
      size: number;
    }>;

    const totalSizeMB = totalSize / (1024 * 1024);

    if (totalSizeMB > maxSizeMB) {
      // Sort by modification time (oldest first)
      validFileStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

      // Delete oldest files until under limit
      let currentSize = totalSizeMB;
      for (const file of validFileStats) {
        if (currentSize <= maxSizeMB) break;

        try {
          await fs.unlink(file.path);
          currentSize -= file.size / (1024 * 1024);
          console.log(`Removed file to free space: ${path.basename(file.path)}`); // Don't log full path
        } catch (error) {
          console.warn(`Failed to remove file: ${sanitizeErrorMessage(error)}`);
        }
      }
    }
  } catch (error) {
    console.warn(`Directory size check failed: ${sanitizeErrorMessage(error)}`);
  }
}

/**
 * Create a unique filename with timestamp - INPUT VALIDATED
 */
export function createUniqueFilename(baseName: string, extension: string): string {
  // Input validation
  if (typeof baseName !== 'string' || !baseName.trim()) {
    baseName = 'file';
  }
  
  if (typeof extension !== 'string' || !extension.trim()) {
    extension = 'png';
  }

  // Sanitize inputs
  const cleanBaseName = baseName
    .replace(/[^a-zA-Z0-9_-]/g, '_')  // Replace special chars with underscore
    .substring(0, 50);  // Limit length
    
  const cleanExtension = extension
    .replace(/[^a-zA-Z0-9]/g, '')  // Remove special chars
    .substring(0, 10);  // Limit length

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  
  return `${cleanBaseName}_${timestamp}_${random}.${cleanExtension}`;
}
