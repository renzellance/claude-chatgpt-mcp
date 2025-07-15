/**
 * ChatGPT interaction service - SECURITY HARDENED (FINAL FIX)
 */

import { CONFIG } from '../core/config.js';
import { createError } from '../utils/error-handling.js';
import { withRetry } from '../utils/retry.js';
import { globalRateLimiter, sanitizeErrorMessage } from '../utils/security.js';
import { 
  checkChatGPTAccess,
  ClipboardManager,
  generateTextScript,
  generateConversationScript,
  executeAppleScript
} from './applescript.js';

/**
 * Send a text prompt to ChatGPT and get response - SECURITY HARDENED
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

    await checkChatGPTAccess();
    
    const clipboard = new ClipboardManager();
    
    try {
      // Save original clipboard
      await clipboard.saveClipboard();
      
      // Generate and execute secure script
      const script = generateTextScript(prompt, conversationId);
      const result = await executeAppleScript(script);
      
      if (!result.success) {
        throw createError(
          `ChatGPT interaction failed: ${result.error}`,
          "INTERACTION_FAILED",
          true
        );
      }
      
      // Process the response
      const cleanedResult = cleanResponse(result.data || '');
      
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
 * Get list of conversations from ChatGPT - SECURITY HARDENED
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

    await checkChatGPTAccess();
    
    try {
      const script = generateConversationScript();
      const result = await executeAppleScript(script);
      
      if (!result.success) {
        if (result.error?.includes("ChatGPT is not running")) {
          throw createError("ChatGPT application is not running", "APP_NOT_RUNNING", false);
        } else if (result.error?.includes("No ChatGPT window found")) {
          throw createError("No ChatGPT window found", "NO_WINDOW", true);
        } else {
          throw createError(sanitizeErrorMessage(result.error || "Unknown error"), "RETRIEVAL_ERROR", true);
        }
      }
      
      // Parse the result with input validation
      if (Array.isArray(result.data)) {
        return result.data
          .filter(conv => typeof conv === 'string' && conv.trim() !== '')
          .slice(0, 50)
          .map(conv => conv.substring(0, 200));
      }
      
      // Handle comma-separated string results
      if (typeof result.data === "string" && result.data.includes(",")) {
        return result.data
          .split(", ")
          .filter(conv => conv.trim() !== "")
          .slice(0, 50)
          .map(conv => conv.substring(0, 200));
      }
      
      // Single conversation or empty result
      if (typeof result.data === "string" && result.data.trim() !== "") {
        return [result.data.substring(0, 200)];
      }
      
      return [];
      
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

// Legacy compatibility exports
export { checkChatGPTAccess, generateTextScript, generateConversationScript, executeAppleScript };
