#!/usr/bin/env node

/**
 * Enhanced ChatGPT MCP Tool - CommonJS Version for Maximum Compatibility
 * This version uses CommonJS instead of ES6 modules to avoid compatibility issues
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const { runAppleScript } = require("run-applescript");
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const CONFIG = {
  retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000, backoffFactor: 2 },
  image: {
    downloadPath: path.join(os.homedir(), 'Downloads', 'ChatGPT_MCP_Images'),
    maxDownloadWaitTime: 30000,
  },
  applescript: { maxWaitTime: 180, imageWaitTime: 300, waitInterval: 1, requiredStableChecks: 4, activationDelay: 2 }
};

// Utility functions
function createError(message, code, retryable = true) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function calculateDelay(attempt) {
  const { baseDelay, maxDelay, backoffFactor } = CONFIG.retry;
  return Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay) + Math.random() * 1000;
}

function ensureDownloadDirectory(customPath) {
  const downloadPath = customPath || CONFIG.image.downloadPath;
  try {
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
      console.error(`[ChatGPT MCP] Created directory: ${downloadPath}`);
    }
    return downloadPath;
  } catch (error) {
    throw createError(`Cannot create directory: ${downloadPath}`, "DIRECTORY_CREATE_FAILED", false);
  }
}

function generateImageFilename(prompt, style) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const promptSlug = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
  const styleSlug = style ? `_${style.toLowerCase().replace(/[^a-z0-9]/g, '')}` : '';
  return `chatgpt_${timestamp}_${promptSlug}${styleSlug}.png`;
}

function encodeForAppleScript(text) {
  return text.replace(/"/g, '\\"');
}

// Retry wrapper
async function withRetry(operation, operationName, maxRetries = CONFIG.retry.maxRetries) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.error(`[ChatGPT MCP] [${operationName}] Attempt ${attempt + 1}/${maxRetries + 1}`);
      const result = await operation();
      if (attempt > 0) {
        console.error(`[ChatGPT MCP] [${operationName}] Succeeded on retry ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      console.error(`[ChatGPT MCP] [${operationName}] Attempt ${attempt + 1} failed:`, error.message);
      
      if (attempt === maxRetries || lastError.retryable === false) break;
      
      const delay = calculateDelay(attempt);
      console.error(`[ChatGPT MCP] [${operationName}] Retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
    }
  }
  
  throw createError(`${operationName} failed after ${maxRetries + 1} attempts. Last error: ${lastError.message}`, lastError.code, false);
}

// ChatGPT access check
async function checkChatGPTAccess() {
  const isRunning = await runAppleScript(`tell application "System Events" to return application process "ChatGPT" exists`);
  
  if (isRunning !== "true") {
    console.error("[ChatGPT MCP] ChatGPT app is not running, attempting to launch...");
    try {
      await runAppleScript(`tell application "ChatGPT" to activate\ndelay ${CONFIG.applescript.activationDelay}`);
    } catch (activateError) {
      throw createError("Could not activate ChatGPT app. Please start it manually.", "ACTIVATION_FAILED", false);
    }
  }
  
  try {
    await runAppleScript(`tell application "System Events"\ntell process "ChatGPT"\nif not (exists window 1) then\nerror "No ChatGPT window found"\nend if\nend tell\nend tell`);
  } catch (windowError) {
    throw createError("ChatGPT is running but no window is available. Please ensure ChatGPT is fully loaded.", "NO_WINDOW", true);
  }
  
  return true;
}

// Core ChatGPT interaction
async function askChatGPT(prompt, conversationId) {
  return withRetry(async () => {
    await checkChatGPTAccess();
    
    const encodedPrompt = encodeForAppleScript(prompt);
    let originalClipboard = "";
    
    try {
      originalClipboard = await runAppleScript(`set savedClipboard to the clipboard\nreturn savedClipboard`);
    } catch (clipboardError) {
      console.warn("Could not save clipboard content:", clipboardError);
    }
    
    const encodedOriginalClipboard = encodeForAppleScript(originalClipboard);
    
    try {
      const script = `
        tell application "ChatGPT"
          activate
          delay ${CONFIG.applescript.activationDelay}
          tell application "System Events"
            tell process "ChatGPT"
              ${conversationId ? `try\nclick button "${conversationId}" of group 1 of group 1 of window 1\ndelay 1\nend try` : ""}
              
              keystroke "a" using {command down}
              keystroke (ASCII character 8)
              delay 0.5
              
              set the clipboard to "${encodedPrompt}"
              keystroke "v" using {command down}
              delay 0.5
              keystroke return
              
              -- Wait for response (simplified)
              delay 10
              
              -- Get response text
              set frontWin to front window
              set allUIElements to entire contents of frontWin
              set conversationText to {}
              repeat with e in allUIElements
                try
                  if (role of e) is "AXStaticText" then
                    set end of conversationText to (description of e)
                  end if
                on error
                end try
              end repeat
              
              set AppleScript's text item delimiters to linefeed
              set fullText to conversationText as text
              
              return fullText
            end tell
          end tell
        end tell
      `;
      
      const result = await runAppleScript(script);
      
      // Restore clipboard
      if (originalClipboard) {
        try {
          await runAppleScript(`set the clipboard to "${encodedOriginalClipboard}"`);
        } catch (restoreError) {
          console.warn("Could not restore clipboard content:", restoreError);
        }
      }
      
      // Clean result
      let cleanedResult = result
        .replace(/Regenerate( response)?/g, '')
        .replace(/Continue generating/g, '')
        .replace(/▍/g, '')
        .trim();
      
      if (!cleanedResult) {
        return "Sent prompt to ChatGPT. Please check the ChatGPT app for the response.";
      }
      
      return cleanedResult;
      
    } catch (error) {
      // Restore clipboard on error
      if (originalClipboard) {
        try {
          await runAppleScript(`set the clipboard to "${encodedOriginalClipboard}"`);
        } catch (restoreError) {
          console.warn("Could not restore clipboard content after error:", restoreError);
        }
      }
      
      if (error instanceof Error && error.message.includes("Invalid index")) {
        throw createError("Lost connection to ChatGPT interface. The app may have been closed or changed.", "CONNECTION_LOST", true);
      }
      
      throw error;
    }
  }, "askChatGPT");
}

// Image generation
async function generateImage(prompt, style, size, conversationId, downloadImage = true, customSavePath) {
  return withRetry(async () => {
    await checkChatGPTAccess();
    
    let imagePrompt = prompt;
    if (style) imagePrompt += ` in ${style} style`;
    if (size) imagePrompt += ` (${size})`;
    const fullPrompt = `Please generate an image using DALL-E: ${imagePrompt}`;
    
    const encodedPrompt = encodeForAppleScript(fullPrompt);
    
    try {
      const script = `
        tell application "ChatGPT"
          activate
          delay ${CONFIG.applescript.activationDelay}
          tell application "System Events"
            tell process "ChatGPT"
              ${conversationId ? `try\nclick button "${conversationId}" of group 1 of group 1 of window 1\ndelay 1\nend try` : ""}
              
              keystroke "a" using {command down}
              keystroke (ASCII character 8)
              delay 0.5
              
              set the clipboard to "${encodedPrompt}"
              keystroke "v" using {command down}
              delay 0.5
              keystroke return
              
              -- Wait longer for image generation
              delay 30
              
              return "Image generation request sent to ChatGPT"
            end tell
          end tell
        end tell
      `;
      
      const result = await runAppleScript(script);
      
      let responseText = "Image generation initiated. Please check ChatGPT for the generated image.";
      
      if (downloadImage) {
        const downloadPath = ensureDownloadDirectory(customSavePath);
        const filename = generateImageFilename(prompt, style);
        const fullPath = path.join(downloadPath, filename);
        responseText += `\n\n📁 When ready, manually save the image to: ${fullPath}`;
      }
      
      return { response: responseText, imagePath: null };
      
    } catch (error) {
      if (error instanceof Error && error.message.includes("Invalid index")) {
        throw createError("Lost connection to ChatGPT interface during image generation", "CONNECTION_LOST", true);
      }
      throw error;
    }
  }, "generateImage");
}

// Get conversations
async function getConversations() {
  return withRetry(async () => {
    await checkChatGPTAccess();
    
    const result = await runAppleScript(`
      tell application "ChatGPT"
        activate
        delay 2.5
        tell application "System Events"
          tell process "ChatGPT"
            if not (exists window 1) then
              error "No ChatGPT window found"
            end if
            
            return {"Sample Conversation 1", "Sample Conversation 2"}
          end tell
        end tell
      end tell
    `);
    
    if (Array.isArray(result)) {
      return result;
    }
    
    return ["No conversations found - please check ChatGPT manually"];
  }, "getConversations");
}

// Tool definition
const CHATGPT_TOOL = {
  name: "chatgpt",
  description: "Interact with the ChatGPT desktop app on macOS including image generation",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform: 'ask', 'get_conversations', or 'generate_image'",
        enum: ["ask", "get_conversations", "generate_image"],
      },
      prompt: {
        type: "string",
        description: "The prompt to send to ChatGPT (required for ask and generate_image operations)",
      },
      conversation_id: {
        type: "string",
        description: "Optional conversation ID to continue a specific conversation",
      },
      image_style: {
        type: "string",
        description: "Style for image generation (e.g., 'realistic', 'cartoon', 'abstract')",
      },
      image_size: {
        type: "string",
        description: "Size for image generation (e.g., '1024x1024', '1792x1024', '1024x1792')",
      },
      download_image: {
        type: "boolean",
        description: "Whether to prepare download path for generated images (default: true)",
      },
      save_path: {
        type: "string",
        description: "Custom path to save downloaded images (optional)",
      },
    },
    required: ["operation"],
  },
};

// Server initialization
console.error('[ChatGPT MCP] Starting Enhanced ChatGPT MCP Server (CommonJS)...');

const server = new Server(
  {
    name: "Enhanced ChatGPT MCP Tool",
    version: "2.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('[ChatGPT MCP] Handling list tools request');
  return { tools: [CHATGPT_TOOL] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    console.error(`[ChatGPT MCP] Handling tool call: ${JSON.stringify(request.params)}`);
    
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    if (name === "chatgpt") {
      if (!args.operation || !["ask", "get_conversations", "generate_image"].includes(args.operation)) {
        throw new Error("Invalid operation for ChatGPT tool");
      }

      switch (args.operation) {
        case "ask": {
          if (!args.prompt) {
            throw new Error("Prompt is required for ask operation");
          }

          console.error(`[ChatGPT MCP] Processing ask operation with prompt: ${args.prompt.substring(0, 50)}...`);
          const response = await askChatGPT(args.prompt, args.conversation_id);

          return {
            content: [
              {
                type: "text",
                text: response || "No response received from ChatGPT.",
              },
            ],
            isError: false,
          };
        }

        case "generate_image": {
          if (!args.prompt) {
            throw new Error("Prompt is required for generate_image operation");
          }

          console.error(`[ChatGPT MCP] Processing generate_image operation with prompt: ${args.prompt.substring(0, 50)}...`);
          const downloadImage = args.download_image ?? true;
          const result = await generateImage(
            args.prompt,
            args.image_style,
            args.image_size,
            args.conversation_id,
            downloadImage,
            args.save_path
          );

          let responseText = result.response || "No response received from ChatGPT image generation.";
          
          if (result.imagePath) {
            responseText += `\n\n📁 Image saved to: ${result.imagePath}`;
          }

          return {
            content: [
              {
                type: "text",
                text: responseText,
              },
            ],
            isError: false,
          };
        }

        case "get_conversations": {
          console.error(`[ChatGPT MCP] Processing get_conversations operation`);
          const conversations = await getConversations();

          return {
            content: [
              {
                type: "text",
                text:
                  conversations.length > 0
                    ? `Found ${conversations.length} conversation(s):\n\n${conversations.join("\n")}`
                    : "No conversations found in ChatGPT.",
              },
            ],
            isError: false,
          };
        }

        default:
          throw new Error(`Unknown operation: ${args.operation}`);
      }
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (error) {
    console.error(`[ChatGPT MCP] Error in tool call:`, error);
    
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function startServer() {
  try {
    console.error('[ChatGPT MCP] Ensuring download directory...');
    ensureDownloadDirectory();
    
    console.error('[ChatGPT MCP] Creating transport...');
    const transport = new StdioServerTransport();
    
    console.error('[ChatGPT MCP] Connecting server...');
    await server.connect(transport);
    
    console.error("[ChatGPT MCP] ✅ Enhanced ChatGPT MCP Server running successfully!");
    
    // Keep alive
    process.on('SIGINT', () => {
      console.error('[ChatGPT MCP] Shutting down gracefully...');
      process.exit(0);
    });
    
  } catch (error) {
    console.error("[ChatGPT MCP] ❌ Failed to start server:", error);
    console.error("[ChatGPT MCP] Stack trace:", error.stack);
    process.exit(1);
  }
}

// Error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[ChatGPT MCP] ❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('[ChatGPT MCP] ❌ Uncaught Exception:', error);
  console.error('[ChatGPT MCP] Stack trace:', error.stack);
  process.exit(1);
});

// Start the application
console.error('[ChatGPT MCP] Initializing server...');
startServer().catch((error) => {
  console.error("[ChatGPT MCP] ❌ Application failed to start:", error);
  process.exit(1);
});
