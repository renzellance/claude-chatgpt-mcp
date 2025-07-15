/**
 * Secure AppleScript generation and execution utilities - FIXED
 */

import { runAppleScript as runAppleScriptNative } from 'run-applescript';
import { sanitizeForAppleScript, globalRateLimiter, sanitizeErrorMessage } from '../utils/security.js';
import { AppleScriptResult } from '../core/types.js';
import { CONFIG } from '../core/config.js';

/**
 * Execute AppleScript with error handling and retries
 */
export async function runAppleScript(script: string, retries: number = 3): Promise<AppleScriptResult> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await runAppleScriptNative(script);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // If this isn't the last attempt and it's a retryable error, wait and retry
      if (attempt < retries && isRetryableError(errorMessage)) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }
  
  return {
    success: false,
    error: "Max retries exceeded"
  };
}

/**
 * Check if an error is retryable
 */
function isRetryableError(errorMessage: string): boolean {
  const retryableErrors = [
    'application is not running',
    'connection timed out',
    'busy',
    'temporary',
    'network',
    'timeout'
  ];
  
  const lowerError = errorMessage.toLowerCase();
  return retryableErrors.some(pattern => lowerError.includes(pattern));
}

/**
 * Check if ChatGPT application is accessible
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
 * Clipboard manager for safe clipboard operations
 */
export class ClipboardManager {
  private originalClipboard: string | null = null;

  async saveClipboard(): Promise<void> {
    const script = `
      tell application "System Events"
        return the clipboard as string
      end tell
    `;
    
    const result = await runAppleScript(script, 1);
    this.originalClipboard = result.success ? result.data || '' : '';
  }

  async restoreClipboard(): Promise<void> {
    if (this.originalClipboard !== null) {
      const sanitizedClipboard = sanitizeForAppleScript(this.originalClipboard);
      const script = `
        tell application "System Events"
          set the clipboard to "${sanitizedClipboard}"
        end tell
      `;
      
      await runAppleScript(script, 1);
    }
  }
}

/**
 * Generate secure AppleScript for text interaction with ChatGPT
 */
export function generateTextScript(prompt: string, conversationId?: string): string {
  // Input validation
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('Invalid prompt provided');
  }

  if (conversationId && typeof conversationId !== 'string') {
    throw new Error('Invalid conversation ID provided');
  }

  // Rate limiting
  if (!globalRateLimiter.isAllowed('text_generation')) {
    throw new Error('Rate limit exceeded for text generation');
  }

  // Sanitize inputs for AppleScript
  const sanitizedPrompt = sanitizeForAppleScript(prompt.trim());
  const sanitizedConvId = conversationId ? sanitizeForAppleScript(conversationId.trim()) : '';

  // Length validation
  if (sanitizedPrompt.length > 4000) {
    throw new Error('Prompt too long - maximum 4000 characters allowed');
  }

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
          
          -- Find the text input area
          try
            set textArea to first text area of window 1
            
            -- Clear any existing text and input new prompt
            click textArea
            delay 0.2
            
            -- Select all and replace
            key code 0 using command down -- Cmd+A
            delay 0.1
            
            -- Type the sanitized prompt
            keystroke "${sanitizedPrompt}"
            delay 0.3
            
            -- Send the message (Enter key or send button)
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
            
          on error errorMsg
            return "Error interacting with ChatGPT: " & errorMsg
          end try
        end tell
      end tell
    end tell
  `;

  return script;
}

/**
 * Generate secure AppleScript for getting conversation list
 */
export function generateConversationScript(): string {
  // Rate limiting
  if (!globalRateLimiter.isAllowed('conversation_list')) {
    throw new Error('Rate limit exceeded for conversation listing');
  }

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
 * Execute AppleScript with enhanced security and error handling
 */
export async function executeAppleScript(script: string): Promise<AppleScriptResult> {
  try {
    // Input validation
    if (typeof script !== 'string' || !script.trim()) {
      return {
        success: false,
        error: 'Invalid AppleScript provided'
      };
    }

    // Length validation to prevent excessively large scripts
    if (script.length > 50000) {
      return {
        success: false,
        error: 'AppleScript too large'
      };
    }

    // Execute with our secure runner
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
 * Check if ChatGPT app is running
 */
export async function isChatGPTRunning(): Promise<boolean> {
  const script = `
    tell application "System Events"
      return (exists (processes whose name is "ChatGPT"))
    end tell
  `;
  
  const result = await runAppleScript(script, 1);
  return result.success && result.data === 'true';
}

/**
 * Launch ChatGPT app if not running
 */
export async function ensureChatGPTRunning(): Promise<AppleScriptResult> {
  const isRunning = await isChatGPTRunning();
  
  if (isRunning) {
    return { success: true, data: "ChatGPT already running" };
  }
  
  const script = `
    tell application "ChatGPT"
      activate
    end tell
    delay 3
    return "ChatGPT launched"
  `;
  
  return await runAppleScript(script);
}

/**
 * Get ChatGPT app version for debugging
 */
export async function getChatGPTVersion(): Promise<string> {
  const script = `
    tell application "ChatGPT"
      return version
    end tell
  `;
  
  const result = await runAppleScript(script, 1);
  return result.success ? result.data || "unknown" : "unknown";
}
