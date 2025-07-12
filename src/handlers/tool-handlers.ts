/**
 * MCP tool request handlers with async support
 */

import { ChatGPTToolArgs } from '../core/types.js';
import { CONFIG } from '../core/config.js';
import { getErrorWithSolution } from '../utils/error-handling.js';
import { askChatGPT, getConversations } from '../services/chatgpt.js';
import { processImageGeneration } from '../services/image-download.js';
import { cleanupFiles } from '../utils/file-system.js';
import { 
	startImageGeneration, 
	checkGenerationStatus, 
	getLatestImage, 
	cleanupGenerations 
} from '../services/async-image-generation.js';

/**
 * Type guard for ChatGPT tool arguments (updated for async operations)
 */
export function isChatGPTArgs(args: unknown): args is ChatGPTToolArgs {
	if (typeof args !== "object" || args === null) return false;

	const { operation, prompt, conversation_id, image_style, image_size, max_retries, download_image, save_path, cleanup_after, generation_id } = args as any;

	if (!operation || !["ask", "get_conversations", "generate_image", "start_image_generation", "check_generation_status", "get_latest_image"].includes(operation)) {
		return false;
	}

	// Validate required fields based on operation
	if ((operation === "ask" || operation === "generate_image" || operation === "start_image_generation") && !prompt) return false;
	if (operation === "check_generation_status" && !generation_id) return false;

	// Validate field types if present
	if (prompt && typeof prompt !== "string") return false;
	if (conversation_id && typeof conversation_id !== "string") return false;
	if (image_style && typeof image_style !== "string") return false;
	if (image_size && typeof image_size !== "string") return false;
	if (max_retries && typeof max_retries !== "number") return false;
	if (download_image && typeof download_image !== "boolean") return false;
	if (save_path && typeof save_path !== "string") return false;
	if (cleanup_after && typeof cleanup_after !== "boolean") return false;
	if (generation_id && typeof generation_id !== "string") return false;

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
 * Handle generate_image operation (legacy sync version)
 */
export async function handleGenerateImageOperation(args: ChatGPTToolArgs) {
	if (!args.prompt) {
		throw new Error("Prompt is required for generate_image operation");
	}

	const downloadImage = args.download_image ?? true;
	const result = await processImageGeneration(
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

	if (args.cleanup_after && result.cleanupFunction) {
		setTimeout(async () => {
			try {
				await result.cleanupFunction!();
			} catch (error) {
				console.warn("Cleanup failed:", error);
			}
		}, 5000);
		
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
 * Handle start_image_generation operation (new async version)
 */
export async function handleStartImageGenerationOperation(args: ChatGPTToolArgs) {
	if (!args.prompt) {
		throw new Error("Prompt is required for start_image_generation operation");
	}

	const generationId = await startImageGeneration(
		args.prompt,
		args.image_style,
		args.image_size,
		args.conversation_id
	);

	return {
		content: [
			{
				type: "text" as const,
				text: `🚀 Image generation started!\n\nGeneration ID: ${generationId}\n\nUse check_generation_status("${generationId}") to check progress.\nUse get_latest_image() to retrieve the image when completed.`,
			},
		],
		isError: false,
	};
}

/**
 * Handle check_generation_status operation
 */
export async function handleCheckGenerationStatusOperation(args: ChatGPTToolArgs) {
	if (!args.generation_id) {
		throw new Error("Generation ID is required for check_generation_status operation");
	}

	const status = await checkGenerationStatus(args.generation_id);
	
	if (!status) {
		return {
			content: [
				{
					type: "text" as const,
					text: `❌ Generation ID "${args.generation_id}" not found.`,
				},
			],
			isError: false,
		};
	}

	let statusText = `📊 Generation Status for ${args.generation_id}:\n\n`;
	statusText += `Status: ${status.status}\n`;
	statusText += `Prompt: "${status.prompt}"\n`;
	statusText += `Started: ${new Date(status.timestamp).toLocaleString()}\n`;
	
	if (status.error) {
		statusText += `Error: ${status.error}\n`;
	}
	
	if (status.imagePath) {
		statusText += `Image Path: ${status.imagePath}\n`;
	}

	switch (status.status) {
		case 'pending':
			statusText += '\n⏳ Generation is pending...';
			break;
		case 'generating':
			statusText += '\n🎨 Generation in progress...';
			break;
		case 'completed':
			statusText += '\n✅ Generation completed! Use get_latest_image() to retrieve it.';
			break;
		case 'failed':
			statusText += '\n❌ Generation failed.';
			break;
	}

	return {
		content: [
			{
				type: "text" as const,
				text: statusText,
			},
		],
		isError: false,
	};
}

/**
 * Handle get_latest_image operation
 */
export async function handleGetLatestImageOperation(args: ChatGPTToolArgs) {
	const result = await getLatestImage(args.save_path);

	return {
		content: [
			{
				type: "text" as const,
				text: `📥 ${result}`,
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
			cleanupGenerations(); // Clean up old async generations
		}, 1000);
	}

	switch (args.operation) {
		case "ask":
			return await handleAskOperation(args);

		case "generate_image":
			return await handleGenerateImageOperation(args);

		case "start_image_generation":
			return await handleStartImageGenerationOperation(args);

		case "check_generation_status":
			return await handleCheckGenerationStatusOperation(args);

		case "get_latest_image":
			return await handleGetLatestImageOperation(args);

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