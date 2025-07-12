/**
 * ChatGPT interaction service
 */

import { CONFIG } from '../core/config.js';
import { createError } from '../utils/error-handling.js';
import { withRetry } from '../utils/retry.js';
import { checkChatGPTAccess, ClipboardManager, generateTextScript, generateConversationScript, executeAppleScript } from './applescript.js';

/**
 * Send a text prompt to ChatGPT and get response
 */
export async function askChatGPT(
	prompt: string,
	conversationId?: string
): Promise<string> {
	return withRetry(async () => {
		await checkChatGPTAccess();
		
		const clipboard = new ClipboardManager();
		
		try {
			// Save original clipboard
			await clipboard.saveClipboard();
			
			// Execute the text interaction script
			const script = generateTextScript(prompt, conversationId);
			const result = await executeAppleScript(script);
			
			if (!result.success) {
				throw createError(
					`ChatGPT interaction failed: ${result.error}`,
					"INTERACTION_FAILED",
					true
				);
			}
			
			// Process the response
			const cleanedResult = cleanResponse(result.data);
			
			if (!cleanedResult) {
				throw createError(
					"Received empty response from ChatGPT",
					"EMPTY_RESPONSE",
					true
				);
			}
			
			return cleanedResult;
			
		} finally {
			// Always restore clipboard
			await clipboard.restoreClipboard();
		}
	}, "askChatGPT");
}

/**
 * Get list of conversations from ChatGPT
 */
export async function getConversations(): Promise<string[]> {
	return withRetry(async () => {
		await checkChatGPTAccess();
		
		const script = generateConversationScript();
		const result = await executeAppleScript(script);
		
		if (!result.success) {
			if (result.error?.includes("ChatGPT is not running")) {
				throw createError("ChatGPT application is not running", "APP_NOT_RUNNING", false);
			} else if (result.error?.includes("No ChatGPT window found")) {
				throw createError("No ChatGPT window found", "NO_WINDOW", true);
			} else {
				throw createError(result.error || "Unknown error", "RETRIEVAL_ERROR", true);
			}
		}
		
		// Parse the result
		if (Array.isArray(result.data)) {
			return result.data;
		}
		
		// Handle comma-separated string results
		if (typeof result.data === "string" && result.data.includes(",")) {
			return result.data.split(", ").filter(conv => conv.trim() !== "");
		}
		
		// Empty result
		return [];
	}, "getConversations");
}

/**
 * Clean up ChatGPT response text
 */
function cleanResponse(response: string): string {
	if (!response) return "";
	
	return response
		.replace(/Regenerate( response)?/g, '')
		.replace(/Continue generating/g, '')
		.replace(/▍/g, '') // Remove cursor indicator
		.replace(/\s+/g, ' ') // Normalize whitespace
		.trim();
}

/**
 * Check if response indicates an error state
 */
export function isErrorResponse(response: string): boolean {
	const errorIndicators = [
		"I'm unable to",
		"I cannot",
		"Error:",
		"Failed to",
		"Something went wrong"
	];
	
	return errorIndicators.some(indicator => 
		response.toLowerCase().includes(indicator.toLowerCase())
	);
}
