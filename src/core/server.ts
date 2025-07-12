/**
 * MCP server setup and configuration
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { handleChatGPTTool, createErrorResponse } from '../handlers/tool-handlers.js';

// Define the ChatGPT tool with enhanced operations
const CHATGPT_TOOL: Tool = {
	name: "chatgpt",
	description: "Interact with the ChatGPT desktop app on macOS including image generation with download and enhanced error handling",
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
			max_retries: {
				type: "number",
				description: "Maximum number of retries (default: 3)",
			},
			download_image: {
				type: "boolean",
				description: "Whether to download generated images to file system (default: true for generate_image)",
			},
			save_path: {
				type: "string",
				description: "Custom path to save downloaded images (optional)",
			},
			cleanup_after: {
				type: "boolean",
				description: "Whether to automatically cleanup downloaded files after processing (default: follows config)",
			},
		},
		required: ["operation"],
	},
};

/**
 * Create and configure the MCP server
 */
export function createServer(): Server {
	const server = new Server(
		{
			name: "ChatGPT MCP Tool with Enhanced Image Download",
			version: "2.0.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	// Register list tools handler
	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: [CHATGPT_TOOL],
	}));

	// Register call tool handler
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		try {
			const { name, arguments: args } = request.params;

			if (!args) {
				throw new Error("No arguments provided");
			}

			if (name === "chatgpt") {
				return await handleChatGPTTool(args);
			}

			return {
				content: [{ type: "text", text: `Unknown tool: ${name}` }],
				isError: true,
			};
		} catch (error) {
			return createErrorResponse(error);
		}
	});

	return server;
}
