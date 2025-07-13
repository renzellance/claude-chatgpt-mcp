/**
 * ChatGPT interaction service - FULLY SECURITY HARDENED
 * Updated to use unified security wrapper
 */

import { CONFIG } from '../core/config.js';
import { createError } from '../utils/error-handling.js';
import { withRetry } from '../utils/retry.js';
import { globalRateLimiter, sanitizeErrorMessage } from '../utils/security.js';
import { 
  executeSecureStatusCheck,
  executeSecureTextScript,
  executeSecureConversationScript
} from '../utils/secure-applescript.js';

/**
 * Clipboard manager for safe clipboard operations - ENHANCED
 */
export class ClipboardManager {
  private originalClipboard: string | null = null;
  private timeoutId: NodeJS.Timeout | null = null;

  async saveClipboard(): Promise<void> {
    try {
      const { executeSecureAppleScript } = await import('../utils/secure-applescript.js');
      const script = `
        tell application "System Events"
          return the clipboard as string
        end tell
      `;
      
      const result = await executeSecureAppleScript(script, 'clipboard_save', 1);
      this.originalClipboard = result.success ? result.data || '' : '';
      
      // Set timeout to clear clipboard data after 5 minutes for security
      this.timeoutId = setTimeout(() => {
        this.originalClipboard = null;
      }, 5 * 60 * 1000);
      
    } catch (error) {
      this.originalClipboard = '';
    }
  }

  async restoreClipboard(): Promise<void> {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    if (this.originalClipboard !== null) {
      try {
        const { executeSecureAppleScript } = await import('../utils/secure-applescript.js');
        const { sanitizeForAppleScript } = await import('../utils/security.js');
        
        const sanitizedClipboard = sanitizeForAppleScript(this.originalClipboard);
        const script = `
          tell application "System Events"
            set the clipboard to "${sanitizedClipboard}"
          end tell
        `;
        
        await executeSecureAppleScript(script, 'clipboard_restore', 1);
      } catch (error) {
        // Log but don't throw - clipboard restoration is not critical
        console.warn('Failed to restore clipboard:', sanitizeErrorMessage(error));
      } finally {
        this.originalClipboard = null;
      }
    }
  }
}

/**
 * Send a text prompt to ChatGPT and get response - FULLY SECURITY HARDENED
 */
export async function askChatGPT(
  prompt: string,
  conversationId?: string
): Promise<string> {
  return withRetry(async () => {
    // Input validation
    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw createError(
        'Invalid prompt provided',
        'INVALID_INPUT',
        false
      );
    }

    // Length validation
    if (prompt.length > 4000) {
      throw createError(
        'Prompt too long - maximum 4000 characters allowed',
        'PROMPT_TOO_LONG',
        false
      );
    }

    // Rate limiting check
    if (!globalRateLimiter.isAllowed('ask_chatgpt')) {
      throw createError(
        `Rate limit exceeded. ${globalRateLimiter.getRemainingRequests('ask_chatgpt')} requests remaining.`,
        'RATE_LIMITED',
        false
      );
    }

    // Check ChatGPT accessibility using secure wrapper
    const isAccessible = await executeSecureStatusCheck();
    if (!isAccessible) {
      throw createError(
        'ChatGPT application is not running or not accessible',
        'APP_NOT_ACCESSIBLE',
        true
      );
    }
    
    const clipboard = new ClipboardManager();
    
    try {
      // Save original clipboard
      await clipboard.saveClipboard();
      
      // Execute secure text script
      const response = await executeSecureTextScript(prompt, conversationId);
      
      // Process the response
      const cleanedResult = cleanResponse(response);
      
      if (!cleanedResult) {
        throw createError(
          "Received empty response from ChatGPT",
          "EMPTY_RESPONSE",
          true
        );
      }
      
      return cleanedResult;
      
    } catch (error) {
      // Enhanced error handling with sanitization
      const sanitizedError = sanitizeErrorMessage(error);
      throw createError(
        sanitizedError,
        "INTERACTION_ERROR",
        true
      );
    } finally {
      // Always restore clipboard
      await clipboard.restoreClipboard();
    }
  }, "askChatGPT");
}

/**
 * Get list of conversations from ChatGPT - FULLY SECURITY HARDENED
 */
export async function getConversations(): Promise<string[]> {
  return withRetry(async () => {
    // Rate limiting check
    if (!globalRateLimiter.isAllowed('get_conversations')) {
      throw createError(
        `Rate limit exceeded. ${globalRateLimiter.getRemainingRequests('get_conversations')} requests remaining.`,
        'RATE_LIMITED',
        false
      );
    }

    // Check ChatGPT accessibility using secure wrapper
    const isAccessible = await executeSecureStatusCheck();
    if (!isAccessible) {
      throw createError(
        'ChatGPT application is not running or not accessible',
        'APP_NOT_ACCESSIBLE',
        true
      );
    }
    
    try {
      // Execute secure conversation script
      const conversations = await executeSecureConversationScript();
      
      // Additional validation and filtering
      return conversations
        .filter(conv => typeof conv === 'string' && conv.trim() !== '')
        .filter(conv => !conv.toLowerCase().includes('error'))
        .slice(0, 50) // Reasonable limit
        .map(conv => conv.substring(0, 200)); // Length limit
      
    } catch (error) {
      throw createError(
        sanitizeErrorMessage(error),
        "CONVERSATION_RETRIEVAL_ERROR",
        true
      );
    }
  }, "getConversations");
}

/**
 * Clean up ChatGPT response text - ENHANCED SECURITY
 */
function cleanResponse(response: string): string {
  if (!response || typeof response !== 'string') return "";
  
  // Length validation
  if (response.length > 50000) {
    response = response.substring(0, 50000) + "... [truncated for security]";
  }
  
  return response
    .replace(/Regenerate( response)?/g, '')
    .replace(/Continue generating/g, '')
    .replace(/▍/g, '') // Remove cursor indicator
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters except \n, \r, \t
    .trim();
}

/**
 * Check if response indicates an error state - ENHANCED
 */
export function isErrorResponse(response: string): boolean {
  if (!response || typeof response !== 'string') return true;
  
  const errorIndicators = [
    "I'm unable to",
    "I cannot",
    "Error:",
    "Failed to",
    "Something went wrong",
    "Rate limit",
    "Too many requests",
    "Service unavailable",
    "Connection error",
    "Access denied",
    "Permission denied"
  ];
  
  const lowerResponse = response.toLowerCase();
  return errorIndicators.some(indicator => 
    lowerResponse.includes(indicator.toLowerCase())
  );
}

/**
 * Validate conversation ID format
 */
export function validateConversationId(conversationId: string): boolean {
  if (!conversationId || typeof conversationId !== 'string') return false;
  
  // Basic validation: reasonable length, alphanumeric with common separators
  const cleanId = conversationId.trim();
  if (cleanId.length < 3 || cleanId.length > 100) return false;
  
  // Allow alphanumeric, hyphens, underscores, and dots
  const validPattern = /^[a-zA-Z0-9\-_.]+$/;
  return validPattern.test(cleanId);
}

/**
 * Check ChatGPT application health
 */
export async function checkChatGPTHealth(): Promise<{
  isRunning: boolean;
  isAccessible: boolean;
  version?: string;
  timestamp: number;
}> {
  const timestamp = Date.now();
  
  try {
    const isRunning = await executeSecureStatusCheck();
    
    if (!isRunning) {
      return {
        isRunning: false,
        isAccessible: false,
        timestamp
      };
    }
    
    // Try to get version info
    let version: string | undefined;
    try {
      const { executeSecureAppleScript } = await import('../utils/secure-applescript.js');
      const script = `
        tell application "ChatGPT"
          return version
        end tell
      `;
      
      const result = await executeSecureAppleScript(script, 'version_check', 1);
      version = result.success ? result.data : undefined;
    } catch {
      // Version check is optional
    }
    
    return {
      isRunning: true,
      isAccessible: true,
      version,
      timestamp
    };
    
  } catch (error) {
    return {
      isRunning: false,
      isAccessible: false,
      timestamp
    };
  }
}

// Legacy compatibility exports
export const checkChatGPTAccess = executeSecureStatusCheck;
export const generateTextScript = executeSecureTextScript;
export const generateConversationScript = executeSecureConversationScript;
