/**
 * MCP tool request handlers
 */

import { ChatGPTToolArgs } from '../core/types.js';
import { CONFIG } from '../core/config.js';
import { getErrorWithSolution } from '../utils/error-handling.js';
import { askChatGPT, getConversations } from '../services/chatgpt.js';
import { processImageGeneration } from '../services/image-download.js';
import { cleanupFiles } from '../utils/file-system.js';

/**
 * Type guard for ChatGPT tool arguments
 */
export function isChatGPTArgs(args: unknown): args is ChatGPTToolArgs {
	if (typeof args !== "object" || args === null) return false;

	const { operation, prompt, conversation_id, image_style, image_size, max_retries, download_image, save_path, cleanup_after } = args as any;

	if (!operation || !["ask", "get_conversations", "generate_image"].includes(operation)) {
		return false;
	}

	// Validate required fields based on operation
	if ((operation === "ask" || operation === "generate_image") && !prompt) return false;

	// Validate field types if present
	if (prompt && typeof prompt !== "string") return false;
	if (conversation_id && typeof conversation_id !== "string") return false;
	if (image_style && typeof image_style !== "string") return false;
	if (image_size && typeof image_size !== "string") return false;
	if (max_retries && typeof max_retries !== "number") return false;
	if (download_image && typeof download_image !== "boolean") return false;
	if (save_path && typeof save_path !== "string") return false;
	if (cleanup_after && typeof cleanup_after !== "boolean") return false;

	return true;
}

/**
 * Handle ask operation
 */
export async function handleAskOperation(args: ChatGPTToolArgs) {
	if (!args.prompt) {
		throw new Error("Prompt is required for ask operation");
	}

	const response = await askChatGPT(args.prompt, args.conversation_id);

	return {
		content: [
			{
				type: "text" as const,
				text: response || "No response received from ChatGPT.",
			},
		],
		isError: false,
	};
}

/**
 * Handle generate_image operation
 */
export async function handleGenerateImageOperation(args: ChatGPTToolArgs) {
	if (!args.prompt) {
		throw new Error("Prompt is required for generate_image operation");
	}

	const downloadImage = args.download_image ?? true; // Default to true for image generation
	const result = await processImageGeneration(
		args.prompt,
		args.image_style,
		args.image_size,
		args.conversation_id,
		downloadImage,
		args.save_path
	);

	let responseText = result.response || "No response received from ChatGPT image generation.";
	
	// Add file path information if image was downloaded
	if (result.imagePath) {
		responseText += `\n\n📁 Image saved to: ${result.imagePath}`;
	}

	// Handle cleanup if requested
	if (args.cleanup_after && result.cleanupFunction) {
		// Schedule cleanup after a short delay to allow user to see the result
		setTimeout(async () => {
			try {
				await result.cleanupFunction!();
			} catch (error) {
				console.warn("Cleanup failed:", error);
			}
		}, 5000); // 5 second delay
		
		responseText += "\n\n🗑️ File will be automatically cleaned up in 5 seconds.";
	}

	return {
		content: [
			{
				type: "text" as const,
				text: responseText,
			},
		],
		isError: false,
	};
}

/**
 * Handle get_conversations operation
 */
export async function handleGetConversationsOperation() {
	const conversations = await getConversations();

	return {
		content: [
			{
				type: "text" as const,
				text:
					conversations.length > 0
						? `Found ${conversations.length} conversation(s):\n\n${conversations.join("\n")}`
						: "No conversations found in ChatGPT.",
			},
		],
		isError: false,
	};
}

/**
 * Main tool handler that routes to specific operations
 */
export async function handleChatGPTTool(args: unknown) {
	if (!isChatGPTArgs(args)) {
		throw new Error("Invalid arguments for ChatGPT tool");
	}

	// Periodic cleanup in background
	if (Math.random() < 0.1) { // 10% chance to run cleanup
		setTimeout(() => {
			cleanupFiles(CONFIG.image.downloadPath).catch(error => 
				console.warn("Background cleanup failed:", error)
			);
		}, 1000);
	}

	switch (args.operation) {
		case "ask":
			return await handleAskOperation(args);

		case "generate_image":
			return await handleGenerateImageOperation(args);

		case "get_conversations":
			return await handleGetConversationsOperation();

		default:
			throw new Error(`Unknown operation: ${(args as any).operation}`);
	}
}

/**
 * Create error response with helpful information
 */
export function createErrorResponse(error: unknown) {
	const errorMessage = error instanceof Error 
		? getErrorWithSolution(error as any)
		: `Unknown error: ${String(error)}`;
	
	return {
		content: [
			{
				type: "text" as const,
				text: errorMessage,
			},
		],
		isError: true,
	};
}
