/**
 * Unified Security Wrapper for AppleScript Operations
 * Ensures all AppleScript execution goes through consistent security measures
 */

import { runAppleScript as runAppleScriptBase } from '../utils/applescript.js';
import { sanitizeForAppleScript, globalRateLimiter, sanitizeErrorMessage } from './security.js';
import { createError, withErrorHandling } from './error-handling.js';
import { AppleScriptResult } from '../core/types.js';

/**
 * Security-wrapped AppleScript execution
 * All AppleScript operations should use this wrapper
 */
export const executeSecureAppleScript = withErrorHandling(async (
  script: string,
  operationType: string = 'applescript_operation',
  retries: number = 3
): Promise<AppleScriptResult> => {
  // Input validation
  if (!script || typeof script !== 'string') {
    throw createError('Invalid AppleScript provided', 'INVALID_APPLESCRIPT', false);
  }
  
  if (script.length > 50000) {
    throw createError('AppleScript too large', 'APPLESCRIPT_TOO_LARGE', false);
  }
  
  // Rate limiting per operation type
  if (!globalRateLimiter.isAllowed(operationType)) {
    throw createError(
      `Rate limit exceeded for ${operationType}. ${globalRateLimiter.getRemainingRequests(operationType)} requests remaining.`,
      'RATE_LIMITED',
      false
    );
  }
  
  try {
    const result = await runAppleScriptBase(script, retries);
    
    return {
      success: result.success,
      data: result.data,
      error: result.error ? sanitizeErrorMessage(result.error) : undefined
    };
    
  } catch (error) {
    throw createError(
      `AppleScript execution failed: ${sanitizeErrorMessage(error)}`,
      'APPLESCRIPT_EXECUTION_FAILED',
      true
    );
  }
}, 'executeSecureAppleScript');

/**
 * Generate and execute secure text interaction script
 */
export const executeSecureTextScript = withErrorHandling(async (
  prompt: string,
  conversationId?: string
): Promise<string> => {
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
  
  const result = await executeSecureAppleScript(script, 'text_interaction');
  
  if (!result.success) {
    throw createError(
      `Text interaction failed: ${result.error}`,
      'TEXT_INTERACTION_FAILED',
      true
    );
  }
  
  return result.data || '';
}, 'executeSecureTextScript');

/**
 * Generate and execute secure image generation script
 */
export const executeSecureImageScript = withErrorHandling(async (
  prompt: string,
  style?: string,
  size?: string,
  conversationId?: string
): Promise<string> => {
  // Input validation
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw createError('Invalid prompt provided', 'INVALID_INPUT', false);
  }
  
  if (prompt.length > 4000) {
    throw createError('Prompt too long - maximum 4000 characters allowed', 'PROMPT_TOO_LONG', false);
  }
  
  // Build full prompt
  let fullPrompt = prompt.trim();
  if (style) {
    fullPrompt += `, ${style} style`;
  }
  if (size) {
    fullPrompt += `, ${size}`;
  }
  
  // Sanitize the complete prompt
  const sanitizedPrompt = sanitizeForAppleScript(fullPrompt);
  
  const script = `
    tell application "ChatGPT"
      activate
      delay 1
      
      tell application "System Events"
        tell process "ChatGPT"
          ${conversationId ? `
          -- Navigate to specific conversation if provided
          try
            -- Implementation for conversation navigation would go here
            delay 0.5
          end try
          ` : ''}
          
          -- Find the input text area with fallback strategies
          try
            set inputField to text area 1 of scroll area 1 of group 1 of group 1 of window 1
          on error
            try
              -- Fallback: find any text area that's editable
              set inputField to first text area of window 1 whose value of attribute "AXEnabled" is true
            on error
              error "Could not find input field"
            end try
          end try
          
          -- Clear any existing text and type the prompt
          set focused of inputField to true
          key code 0 using {command down} -- Cmd+A to select all
          delay 0.1
          keystroke "${sanitizedPrompt}"
          delay 0.5
          
          -- Press Enter to send
          key code 36 -- Enter key
          delay 1
          
          return "Image generation initiated"
        end tell
      end tell
    end tell
  `;
  
  const result = await executeSecureAppleScript(script, 'image_generation');
  
  if (!result.success) {
    throw createError(
      `Image generation failed: ${result.error}`,
      'IMAGE_GENERATION_FAILED',
      true
    );
  }
  
  return result.data || 'Image generation initiated';
}, 'executeSecureImageScript');

/**
 * Execute secure conversation list retrieval
 */
export const executeSecureConversationScript = withErrorHandling(async (): Promise<string[]> => {
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
  
  const result = await executeSecureAppleScript(script, 'conversation_list');
  
  if (!result.success) {
    throw createError(
      `Conversation retrieval failed: ${result.error}`,
      'CONVERSATION_RETRIEVAL_FAILED',
      true
    );
  }
  
  // Parse the result with input validation
  if (Array.isArray(result.data)) {
    return result.data
      .filter(conv => typeof conv === 'string' && conv.trim() !== '')
      .slice(0, 50) // Limit to reasonable number
      .map(conv => conv.substring(0, 200)); // Limit length of each conversation title
  }
  
  // Handle comma-separated string results
  if (typeof result.data === "string" && result.data.includes(",")) {
    return result.data
      .split(", ")
      .filter(conv => conv.trim() !== "")
      .slice(0, 50) // Limit to reasonable number
      .map(conv => conv.substring(0, 200)); // Limit length
  }
  
  // Single conversation or empty result
  if (typeof result.data === "string" && result.data.trim() !== "") {
    return [result.data.substring(0, 200)];
  }
  
  return [];
}, 'executeSecureConversationScript');

/**
 * Execute secure app status check
 */
export const executeSecureStatusCheck = withErrorHandling(async (): Promise<boolean> => {
  const script = `
    tell application "System Events"
      return (exists (processes whose name is "ChatGPT"))
    end tell
  `;
  
  const result = await executeSecureAppleScript(script, 'status_check', 1);
  return result.success && result.data === 'true';
}, 'executeSecureStatusCheck');

/**
 * Execute secure UI polling for image generation status
 */
export const executeSecureUIPolling = withErrorHandling(async (): Promise<{
  isGenerating: boolean;
  hasRecentImage: boolean;
  imageCount: number;
}> => {
  const script = `
    tell application "ChatGPT"
      activate
      delay 0.5
      
      tell application "System Events"
        tell process "ChatGPT"
          -- Check for generating indicators
          set isGenerating to false
          set hasImages to false
          set imageCount to 0
          
          -- Look for "Generating..." or similar indicators
          try
            set generatingElements to (every static text of window 1 whose value contains "generating" or value contains "Generating" or value contains "Creating")
            if (count of generatingElements) > 0 then
              set isGenerating to true
            end if
          end try
          
          -- Check for recent images and count them
          try
            set imageElements to (every image of window 1)
            set imageCount to count of imageElements
            if imageCount > 0 then
              set hasImages to true
            end if
          end try
          
          return "isGenerating:" & isGenerating & ",hasImages:" & hasImages & ",imageCount:" & imageCount
        end tell
      end tell
    end tell
  `;
  
  const result = await executeSecureAppleScript(script, 'ui_polling');
  
  if (!result.success) {
    return {isGenerating: false, hasRecentImage: false, imageCount: 0};
  }
  
  // Parse the result robustly
  const data = result.data || "isGenerating:false,hasImages:false,imageCount:0";
  return {
    isGenerating: data.includes("isGenerating:true"),
    hasRecentImage: data.includes("hasImages:true"),
    imageCount: parseInt(data.match(/imageCount:(\d+)/)?.[1] || "0", 10)
  };
}, 'executeSecureUIPolling');

/**
 * Legacy compatibility exports
 * These maintain the old API while using the secure wrapper
 */
export const checkChatGPTAccess = executeSecureStatusCheck;
export const generateTextScript = (prompt: string, conversationId?: string) => 
  executeSecureTextScript(prompt, conversationId);
export const generateConversationScript = executeSecureConversationScript;
export const executeAppleScript = executeSecureAppleScript;
