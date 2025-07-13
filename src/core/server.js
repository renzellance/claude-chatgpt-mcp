/**
 * MCP Server setup - CommonJS Version
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { handleChatGPTTool, createErrorResponse } = require('../handlers/tool-handlers');

/**
 * Create MCP server with tool definitions
 */
function createServer() {
	const server = new Server(
		{
			name: "claude-chatgpt-mcp",
			version: "2.1.0",
		},
		{
			capabilities: {
				tools: {},
			},
		}
	);

	// List available tools
	server.setRequestHandler("tools/list", async () => {
		return {
			tools: [
				{
					name: "chatgpt",
					description: "Interact with ChatGPT desktop app with async image generation support. Operations: ask, generate_image (sync), start_image_generation (async), check_generation_status (async), get_latest_image (async), get_conversations",
					inputSchema: {
						type: "object",
						properties: {
							operation: {
								type: "string",
								enum: ["ask", "get_conversations", "generate_image", "start_image_generation", "check_generation_status", "get_latest_image"],
								description: "Operation to perform"
							},
							prompt: {
								type: "string",
								description: "Text prompt for ask, generate_image, or start_image_generation operations"
							},
							conversation_id: {
								type: "string",
								description: "Optional conversation ID to continue specific conversation"
							},
							image_style: {
								type: "string",
								description: "Image style (realistic, cartoon, abstract, etc.)"
							},
							image_size: {
								type: "string",
								description: "Image size (1024x1024, 1792x1024, 1024x1792)"
							},
							generation_id: {
								type: "string",
								description: "Generation ID for check_generation_status operation"
							},
							download_image: {
								type: "boolean",
								description: "Whether to download image file (default: true)"
							},
							save_path: {
								type: "string",
								description: "Custom save path for image"
							},
							cleanup_after: {
								type: "boolean",
								description: "Auto-cleanup file after processing"
							},
							max_retries: {
								type: "number",
								description: "Maximum retry attempts"
							}
						},
						required: ["operation"]
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
			console.error(`Tool execution error:`, error);
			return createErrorResponse(error);
		}
	});

	return server;
}

module.exports = { createServer };