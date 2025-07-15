/**
 * Async Image Generation Service - SECURITY HARDENED (FINAL FIX)
 */

import { GenerationStatus, AsyncImageGeneration, GenerationTracker } from '../core/types.js';
import { CONFIG } from '../core/config.js';
import { v4 as uuidv4 } from 'uuid';
import { globalRateLimiter, sanitizeErrorMessage, sanitizeForAppleScript } from '../utils/security.js';
import { createError, withErrorHandling } from '../utils/error-handling.js';
import { runAppleScript } from './applescript.js';

class AsyncGenerationTracker implements GenerationTracker {
  activeGenerations = new Map<string, AsyncImageGeneration>();
  completedGenerations = new Map<string, GenerationStatus>();
  
  // Add size limits to prevent memory leaks
  private readonly MAX_ACTIVE = 50;
  private readonly MAX_COMPLETED = 100;
  
  getStatus(id: string): GenerationStatus | null {
    // Input validation
    if (!id || typeof id !== 'string') return null;
    
    // Check completed first
    const completed = this.completedGenerations.get(id);
    if (completed) return completed;
    
    // Check active
    const active = this.activeGenerations.get(id);
    if (active) {
      return {
        id: active.id,
        status: 'generating',
        prompt: active.prompt,
        timestamp: active.started_at
      };
    }
    
    return null;
  }
  
  cleanup(): void {
    // Clean up old completed generations (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [id, status] of this.completedGenerations.entries()) {
      if (status.timestamp < oneHourAgo) {
        this.completedGenerations.delete(id);
      }
    }
    
    // Enforce size limits
    if (this.activeGenerations.size > this.MAX_ACTIVE) {
      // Remove oldest active generations
      const sortedActive = Array.from(this.activeGenerations.entries())
        .sort(([,a], [,b]) => a.started_at - b.started_at);
      
      const toRemove = sortedActive.slice(0, this.activeGenerations.size - this.MAX_ACTIVE);
      toRemove.forEach(([id]) => this.activeGenerations.delete(id));
    }
    
    if (this.completedGenerations.size > this.MAX_COMPLETED) {
      // Remove oldest completed generations
      const sortedCompleted = Array.from(this.completedGenerations.entries())
        .sort(([,a], [,b]) => a.timestamp - b.timestamp);
      
      const toRemove = sortedCompleted.slice(0, this.completedGenerations.size - this.MAX_COMPLETED);
      toRemove.forEach(([id]) => this.completedGenerations.delete(id));
    }
  }
}

// Global tracker instance
const tracker = new AsyncGenerationTracker();

// Schedule periodic cleanup
setInterval(() => {
  tracker.cleanup();
}, 5 * 60 * 1000); // Every 5 minutes

/**
 * Start async image generation - SECURITY HARDENED
 */
export const startImageGeneration = withErrorHandling(async (
  prompt: string,
  style?: string,
  size?: string,
  conversation_id?: string
): Promise<string> => {
  // Input validation
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw createError('Invalid prompt provided', 'INVALID_INPUT', false);
  }
  
  if (prompt.length > 4000) {
    throw createError('Prompt too long - maximum 4000 characters allowed', 'PROMPT_TOO_LONG', false);
  }
  
  // Rate limiting
  if (!globalRateLimiter.isAllowed('start_image_generation')) {
    throw createError(
      `Rate limit exceeded. ${globalRateLimiter.getRemainingRequests('start_image_generation')} requests remaining.`,
      'RATE_LIMITED',
      false
    );
  }
  
  // Check batch limits
  if (tracker.activeGenerations.size >= 10) {
    throw createError('Too many active generations. Please wait for some to complete.', 'BATCH_LIMIT_EXCEEDED', true);
  }
  
  const id = uuidv4();
  
  // Store generation info
  const generation: AsyncImageGeneration = {
    id,
    prompt: prompt.trim(),
    style,
    size,
    conversation_id,
    started_at: Date.now()
  };
  
  tracker.activeGenerations.set(id, generation);
  
  // Start generation in background using secure method
  triggerSecureImageGeneration(prompt.trim(), style, size, conversation_id, id)
    .catch(error => {
      // Mark as failed with sanitized error
      tracker.completedGenerations.set(id, {
        id,
        status: 'failed',
        prompt: prompt.trim(),
        timestamp: Date.now(),
        error: sanitizeErrorMessage(error)
      });
      tracker.activeGenerations.delete(id);
    });
  
  return id;
}, 'startImageGeneration');

/**
 * Check generation status - ENHANCED WITH BETTER VERIFICATION
 */
export const checkGenerationStatus = withErrorHandling(async (id: string): Promise<GenerationStatus | null> => {
  // Input validation
  if (!id || typeof id !== 'string') {
    throw createError('Invalid generation ID provided', 'INVALID_INPUT', false);
  }
  
  const status = tracker.getStatus(id);
  if (!status) return null;
  
  // If still generating, poll ChatGPT UI for status
  if (status.status === 'generating') {
    try {
      const uiStatus = await pollChatGPTUI();
      
      // Enhanced completion check - verify actual image exists AND generation stopped
      if (uiStatus.isGenerating === false && uiStatus.hasRecentImage && uiStatus.imageCount > 0) {
        // Move to completed
        tracker.completedGenerations.set(id, {
          id,
          status: 'completed',
          prompt: status.prompt,
          timestamp: Date.now()
        });
        tracker.activeGenerations.delete(id);
        
        return tracker.completedGenerations.get(id)!;
      }
      
      // Check for timeout (30 minutes max)
      const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
      if (status.timestamp < thirtyMinutesAgo) {
        tracker.completedGenerations.set(id, {
          id,
          status: 'failed',
          prompt: status.prompt,
          timestamp: Date.now(),
          error: 'Generation timeout'
        });
        tracker.activeGenerations.delete(id);
        
        return tracker.completedGenerations.get(id)!;
      }
    } catch (error) {
      // Don't fail the status check if UI polling fails
      console.warn('UI polling failed:', sanitizeErrorMessage(error));
    }
  }
  
  return status;
}, 'checkGenerationStatus');

/**
 * Get the latest generated image - SECURITY HARDENED
 */
export const getLatestImage = withErrorHandling(async (downloadPath?: string): Promise<string> => {
  // Rate limiting
  if (!globalRateLimiter.isAllowed('get_latest_image')) {
    throw createError(
      `Rate limit exceeded. ${globalRateLimiter.getRemainingRequests('get_latest_image')} requests remaining.`,
      'RATE_LIMITED',
      false
    );
  }
  
  // Path validation if provided
  if (downloadPath) {
    if (typeof downloadPath !== 'string') {
      throw createError('Invalid download path provided', 'INVALID_INPUT', false);
    }
  }
  
  const script = `
    tell application "ChatGPT"
      activate
      delay 0.5
      
      -- Look for the most recent image in the conversation
      tell application "System Events"
        tell process "ChatGPT"
          -- Find images in the conversation
          set imageElements to (every image of window 1)
          if (count of imageElements) > 0 then
            -- Get the last (most recent) image
            set lastImage to item -1 of imageElements
            
            -- Right-click to open context menu
            perform action "AXShowMenu" of lastImage
            delay 0.3
            
            -- Try multiple download strategies
            try
              click menu item "Save image" of menu 1
              return "Image save initiated"
            on error
              try
                click menu item "Download image" of menu 1
                return "Image download initiated"
              on error
                try
                  click menu item "Copy image" of menu 1
                  return "Image copied to clipboard"
                on error
                  try
                    click menu item "Save Image As..." of menu 1
                    return "Image save dialog opened"
                  on error
                    return "No download option found"
                  end try
                end try
              end try
            end try
          else
            return "No images found in conversation"
          end if
        end tell
      end tell
    end tell
  `;
  
  const result = await runAppleScript(script);
  if (!result.success) {
    throw createError(`Failed to get latest image: ${sanitizeErrorMessage(result.error)}`, 'IMAGE_RETRIEVAL_FAILED', true);
  }
  
  return result.data || "Image retrieval completed";
}, 'getLatestImage');

/**
 * Internal function to trigger image generation - SECURITY HARDENED
 */
async function triggerSecureImageGeneration(
  prompt: string,
  style?: string,
  size?: string,
  conversation_id?: string,
  generationId?: string
): Promise<void> {
  let fullPrompt = prompt;
  
  // Add style and size parameters to prompt if specified
  if (style) {
    fullPrompt += `, ${style} style`;
  }
  if (size) {
    fullPrompt += `, ${size}`;
  }
  
  // SECURITY FIX: Apply proper sanitization
  const sanitizedPrompt = sanitizeForAppleScript(fullPrompt);
  
  const script = `
    tell application "ChatGPT"
      activate
      delay 1
      
      tell application "System Events"
        tell process "ChatGPT"
          ${conversation_id ? `
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
        end tell
      end tell
    end tell
  `;
  
  const result = await runAppleScript(script);
  if (!result.success) {
    throw createError(`Failed to trigger image generation: ${sanitizeErrorMessage(result.error)}`, 'GENERATION_TRIGGER_FAILED', true);
  }
}

/**
 * Poll ChatGPT UI to check generation status - ENHANCED
 */
async function pollChatGPTUI(): Promise<{isGenerating: boolean, hasRecentImage: boolean, imageCount: number}> {
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
  
  const result = await runAppleScript(script);
  if (!result.success) {
    return {isGenerating: false, hasRecentImage: false, imageCount: 0};
  }
  
  // Parse the result more robustly
  const data = result.data || "isGenerating:false,hasImages:false,imageCount:0";
  const parsed = {
    isGenerating: data.includes("isGenerating:true"),
    hasRecentImage: data.includes("hasImages:true"),
    imageCount: parseInt(data.match(/imageCount:(\d+)/)?.[1] || "0", 10)
  };
  
  return parsed;
}

/**
 * Cleanup old generations - ENHANCED
 */
export const cleanupGenerations = withErrorHandling((): void => {
  tracker.cleanup();
}, 'cleanupGenerations');

/**
 * Get tracker for testing/debugging
 */
export function getTracker(): GenerationTracker {
  return tracker;
}

/**
 * Get generation statistics for monitoring
 */
export function getGenerationStats() {
  return {
    active: tracker.activeGenerations.size,
    completed: tracker.completedGenerations.size,
    timestamp: Date.now()
  };
}
