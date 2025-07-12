/**
 * Enhanced MCP Server configuration with async tools
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { handleChatGPTTool, createErrorResponse } from "../handlers/tool-handlers.js";

/**
 * Create and configure the MCP server with async capabilities
 */
export function createServer(): Server {
	const server = new Server(
		{
			name: "enhanced-chatgpt-mcp",
			version: "2.0.0", // Updated for async support
		},
		{
			capabilities: {
				tools: {},
			},
		}
	);

	// Register the enhanced ChatGPT tool with async operations
	server.setRequestHandler("tools/list", async () => {
		return {
			tools: [
				{
					name: "chatgpt",
					description: "Enhanced ChatGPT integration with async image generation, conversation management, and file download capabilities. Supports both sync and async operations for image generation.",
					inputSchema: {
						type: "object",
						properties: {
							operation: {
								type: "string",
								enum: [
									"ask",
									"get_conversations", 
									"generate_image",
									"start_image_generation",
									"check_generation_status", 
									"get_latest_image"
								],
								description: "Operation to perform: ask (chat), get_conversations (list), generate_image (sync), start_image_generation (async), check_generation_status (async), get_latest_image (async)"
							},
							prompt: {
								type: "string",
								description: "The prompt/question to send to ChatGPT (required for ask, generate_image, start_image_generation)"
							},
							conversation_id: {
								type: "string",
								description: "Optional conversation ID to continue a specific conversation"
							},
							image_style: {
								type: "string",
								description: "Style for image generation (e.g., 'realistic', 'cartoon', 'abstract')"
							},
							image_size: {
								type: "string", 
								description: "Size for image generation (e.g., '1024x1024', '1792x1024', '1024x1792')"
							},
							generation_id: {
								type: "string",
								description: "Generation ID for checking status (required for check_generation_status)"
							},
							max_retries: {
								type: "number",
								description: "Maximum number of retries for failed operations (default: 3)"
							},
							download_image: {
								type: "boolean",
								description: "Whether to download generated images to local storage (default: true for image generation)"
							},
							save_path: {
								type: "string",
								description: "Custom path to save downloaded images (optional)"
							},
							cleanup_after: {
								type: "boolean",
								description: "Whether to automatically clean up downloaded files after processing (default: false)"
							}
						},
						required: ["operation"],
						additionalProperties: false
					}
				}
			]
		};
	});

	// Handle tool calls
	server.setRequestHandler("tools/call", async (request) => {
		try {
			if (request.params.name === "chatgpt") {
				return await handleChatGPTTool(request.params.arguments);
			} else {
				throw new Error(`Unknown tool: ${request.params.name}`);
			}
		} catch (error) {
			console.error("Tool execution error:", error);
			return createErrorResponse(error);
		}
	});

	return server;
}