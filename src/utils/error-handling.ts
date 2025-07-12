/**
 * Error handling utilities
 */

import { ChatGPTError, ErrorCategory } from '../core/types.js';
import { ERROR_MESSAGES } from '../core/config.js';

/**
 * Create a standardized ChatGPT error
 */
export function createError(
	message: string,
	code?: string,
	retryable: boolean = true,
	category?: ErrorCategory
): ChatGPTError {
	const error = new Error(message) as ChatGPTError;
	error.code = code;
	error.retryable = retryable;
	(error as any).category = category;
	return error;
}

/**
 * Create error with predefined message
 */
export function createPredefinedError(
	code: keyof typeof ERROR_MESSAGES,
	retryable: boolean = true,
	category?: ErrorCategory
): ChatGPTError {
	return createError(ERROR_MESSAGES[code], code, retryable, category);
}

/**
 * Determine if an error is retryable based on its properties
 */
export function isRetryableError(error: Error): boolean {
	const chatGPTError = error as ChatGPTError;
	
	// Explicit retryable flag takes precedence
	if (chatGPTError.retryable !== undefined) {
		return chatGPTError.retryable;
	}
	
	// Check error message patterns
	if (error.message.includes("Invalid index") || 
		error.message.includes("access") ||
		error.message.includes("timeout")) {
		return true;
	}
	
	// Permission errors are not retryable
	if (error.message.includes("permission") ||
		error.message.includes("denied")) {
		return false;
	}
	
	// Default to retryable
	return true;
}

/**
 * Get helpful error message with solution steps
 */
export function getErrorWithSolution(error: ChatGPTError): string {
	let message = `Error: ${error.message}`;
	
	if (error.code) {
		switch (error.code) {
			case "ACCESSIBILITY_DENIED":
				message += "\n\nTo fix this:\n1. Open System Preferences > Privacy & Security > Accessibility\n2. Add Terminal (or iTerm) to the list\n3. Enable the checkbox for Terminal\n4. Restart Claude Desktop";
				break;
			case "APP_NOT_RUNNING":
				message += "\n\nPlease start the ChatGPT desktop app and try again.";
				break;
			case "NO_WINDOW":
				message += "\n\nPlease ensure ChatGPT is fully loaded with a visible window.";
				break;
			case "NO_IMAGES_FOUND":
				message += "\n\nPlease generate an image first, then try downloading.";
				break;
		}
	}
	
	return message;
}

/**
 * Log error with appropriate level
 */
export function logError(error: Error, context: string): void {
	console.error(`[${context}] Error:`, {
		message: error.message,
		code: (error as ChatGPTError).code,
		retryable: (error as ChatGPTError).retryable,
		stack: error.stack?.split('\n').slice(0, 3).join('\n') // First 3 lines only
	});
}
