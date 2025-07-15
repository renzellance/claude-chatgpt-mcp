/**
 * ChatGPT interaction service - SECURITY HARDENED (FIXED)
 */

import { CONFIG } from '../core/config.js';
import { createError } from '../utils/error-handling.js';
import { withRetry } from '../utils/retry.js';
import { globalRateLimiter, sanitizeErrorMessage, sanitizeForAppleScript } from '../utils/security.js';
import { runAppleScript } from '../utils/applescript.js';

/**
 * Clipboard manager for safe clipboard operations
 */
export class ClipboardManager {
  private originalClipboard: string | null = null;
  private timeoutId: NodeJS.Timeout | null = null;

  async saveClipboard(): Promise<void> {
    try {
      const script = `
        tell application "System Events"
          return the clipboard as string
        end tell
      `;
      
      const result = await runAppleScript(script, 1);
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
        const sanitizedClipboard = sanitizeForAppleScript(this.originalClipboard);
        const script = `
          tell application "System Events"
            set the clipboard to "${sanitizedClipboard}"
          end tell
        `;
        
        await runAppleScript(script, 1);
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
 * Check if ChatGPT app is running
 */
export async function checkChatGPTAccess(): Promise<void> {
  const script = `
    tell application "System Events"
      return (exists (processes whose name is "ChatGPT"))
    end tell
  `;

  const result = await runAppleScript(script, 1);
  if (!result.success || result.data !== 'true') {
    throw new Error('ChatGPT application is not running or not accessible');
  }
}

/**
 * Generate secure text interaction script
 */
export function generateTextScript(prompt: string, conversationId?: string): string {
  // Input validation
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw createError('Invalid prompt provided', 'INVALID_INPUT', false);
  }
  
  if (prompt.length > 4000) {
    throw createError('Prompt too long - maximum 4000 characters allowed', 'PROMPT_TOO_LONG', false);
  }

  // Sanitize inputs
  const sanitizedPrompt = sanitizeForAppleScript(prompt.trim());
  const sanitizedConvId = conversationId ? sanitizeForAppleScript(conversationId.trim()) : '';

  const script = `
    tell application "ChatGPT"
      activate
      delay 0.5
      
      tell application "System Events"
        tell process "ChatGPT"
          ${conversationId ? `
          -- Navigate to specific conversation if ID provided
          -- This is a placeholder for conversation navigation logic
          ` : ''}
          
          -- Find the text input area with fallback strategies
          try
            set textArea to first text area of window 1
          on error
            try
              -- Fallback strategy
              set textArea to text area 1 of scroll area 1 of group 1 of group 1 of window 1
            on error
              error "Could not find text input area"
            end try
          end try
          
          -- Clear any existing text and input new prompt
          click textArea
          delay 0.2
          
          -- Select all and replace
          key code 0 using command down -- Cmd+A
          delay 0.1
          
          -- Type the sanitized prompt
          keystroke "${sanitizedPrompt}"
          delay 0.3
          
          -- Send the message (Enter key)
          key code 36 -- Enter key
          
          -- Wait for response to start appearing
          delay 2
          
          -- Wait for response to complete (look for input to become available again)
          repeat with i from 1 to 30
            try
              if enabled of textArea then
                exit repeat
              end if
            end try
            delay 1
          end repeat
          
          -- Get the last response from the conversation
          set responseElements to every static text of window 1
          if (count of responseElements) > 0 then
            -- Get the last few elements that contain the response
            set responseText to ""
            repeat with i from ((count of responseElements) - 5) to (count of responseElements)
              if i > 0 then
                try
                  set responseText to responseText & (value of item i of responseElements) & " "
                end try
              end if
            end repeat
            return responseText
          else
            return "No response received"
          end if
          
        end tell
      end tell
    end tell
  `;

  return script;
}

/**
 * Generate secure conversation list script
 */
export function generateConversationScript(): string {
  const script = `
    tell application "ChatGPT"
      activate
      delay 0.5
      
      tell application "System Events"
        tell process "ChatGPT"
          try
            -- Look for conversation list elements
            set conversationElements to every UI element of window 1 whose role description is "button" or role description is "link"
            
            set conversationList to {}
            repeat with element in conversationElements
              try
                set elementText to value of element
                if elementText is not missing value and elementText is not "" then
                  -- Basic filtering for conversation-like text
                  if length of elementText > 3 and length of elementText < 100 then
                    set end of conversationList to elementText
                  end if
                end if
              end try
            end repeat
            
            if (count of conversationList) > 0 then
              return conversationList
            else
              return {"No conversations found"}
            end if
            
          on error errorMsg
            return {"Error retrieving conversations: " & errorMsg}
          end try
        end tell
      end tell
    end tell
  `;

  return script;
}

/**
 * Execute AppleScript with enhanced security
 */
export async function executeAppleScript(script: string): Promise<{success: boolean; data?: string; error?: string}> {
  try {
    // Input validation
    if (typeof script !== 'string' || !script.trim()) {
      return {
        success: false,
        error: 'Invalid AppleScript provided'
      };
    }

    // Length validation
    if (script.length > 50000) {
      return {
        success: false,
        error: 'AppleScript too large'
      };
    }

    // Execute with secure runner
    const result = await runAppleScript(script);
    
    return {
      success: result.success,
      data: result.data,
      error: result.error ? sanitizeErrorMessage(result.error) : undefined
    };

  } catch (error) {
    return {
      success: false,
      error: sanitizeErrorMessage(error)
    };
  }
}

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
