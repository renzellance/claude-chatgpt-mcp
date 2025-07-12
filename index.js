#!/usr/bin/env node

// Direct execution of the enhanced ChatGPT MCP server
// This bypasses complex build systems and runs the TypeScript directly

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Simple error logging
const log = (msg) => console.error(`[ChatGPT-MCP] ${msg}`);

log('Starting Enhanced ChatGPT MCP Server v2.0.1...');

// Import the MCP SDK directly
async function startServer() {
  try {
    // Import required modules
    const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const {
      CallToolRequestSchema,
      ListToolsRequestSchema,
    } = await import("@modelcontextprotocol/sdk/types.js");
    const { runAppleScript } = await import("run-applescript");

    log('MCP SDK modules loaded successfully');

    // Basic tool definition (simplified version)
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
        },
        required: ["operation"],
      },
    };

    // Create server
    const server = new Server(
      {
        name: "Enhanced ChatGPT MCP Tool",
        version: "2.0.1",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    log('MCP Server created');

    // Basic tool handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [CHATGPT_TOOL],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        if (name !== "chatgpt") {
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
        }

        if (!args?.operation) {
          return {
            content: [{ type: "text", text: "No operation specified" }],
            isError: true,
          };
        }

        // Basic ask operation
        if (args.operation === "ask") {
          if (!args.prompt) {
            return {
              content: [{ type: "text", text: "Prompt is required for ask operation" }],
              isError: true,
            };
          }

          // Simple ChatGPT interaction
          try {
            const script = `
              tell application "ChatGPT"
                activate
                delay 2
                tell application "System Events"
                  tell process "ChatGPT"
                    keystroke "a" using {command down}
                    keystroke (ASCII character 8)
                    delay 0.5
                    set the clipboard to "${args.prompt.replace(/"/g, '\\"')}"
                    keystroke "v" using {command down}
                    delay 0.5
                    keystroke return
                    delay 5
                    return "Message sent to ChatGPT"
                  end tell
                end tell
              end tell
            `;

            const result = await runAppleScript(script);

            return {
              content: [
                {
                  type: "text",
                  text: `Sent prompt to ChatGPT: "${args.prompt}". Please check ChatGPT app for the response.`,
                },
              ],
              isError: false,
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error communicating with ChatGPT: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
        }

        // Other operations
        return {
          content: [
            {
              type: "text",
              text: `Operation "${args.operation}" is not yet implemented in this simplified version.`,
            },
          ],
          isError: false,
        };

      } catch (error) {
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

    log('Request handlers registered');

    // Connect to transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    log('Server connected and running on stdio');

    // Keep the process alive
    process.on('SIGINT', () => {
      log('Shutting down gracefully...');
      process.exit(0);
    });

  } catch (error) {
    log(`FATAL ERROR: ${error.message}`);
    log(`Stack: ${error.stack}`);
    process.exit(1);
  }
}

// Start the server
startServer().catch(error => {
  console.error('[ChatGPT-MCP] Failed to start server:', error);
  process.exit(1);
});
