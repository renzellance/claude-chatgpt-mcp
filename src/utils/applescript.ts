/**
 * AppleScript utilities for ChatGPT desktop app interaction
 */

import { runAppleScript as runAppleScriptNative } from 'run-applescript';
import { AppleScriptResult } from '../core/types.js';
import { CONFIG } from '../core/config.js';

/**
 * Execute AppleScript with error handling and retries
 */
export async function runAppleScript(script: string, retries: number = 3): Promise<AppleScriptResult> {
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			const result = await runAppleScriptNative(script);
			
			return {
				success: true,
				data: result
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			
			// If this isn't the last attempt and it's a retryable error, wait and retry
			if (attempt < retries && isRetryableError(errorMessage)) {
				const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
				await new Promise(resolve => setTimeout(resolve, delay));
				continue;
			}
			
			return {
				success: false,
				error: errorMessage
			};
		}
	}
	
	return {
		success: false,
		error: "Max retries exceeded"
	};
}

/**
 * Check if an error is retryable
 */
function isRetryableError(errorMessage: string): boolean {
	const retryableErrors = [
		'application is not running',
		'connection timed out',
		'busy',
		'temporary',
		'network',
		'timeout'
	];
	
	const lowerError = errorMessage.toLowerCase();
	return retryableErrors.some(pattern => lowerError.includes(pattern));
}

/**
 * Check if ChatGPT app is running
 */
export async function isChatGPTRunning(): Promise<boolean> {
	const script = `
		tell application "System Events"
			return (exists (processes whose name is "ChatGPT"))
		end tell
	`;
	
	const result = await runAppleScript(script, 1);
	return result.success && result.data === 'true';
}

/**
 * Launch ChatGPT app if not running
 */
export async function ensureChatGPTRunning(): Promise<AppleScriptResult> {
	const isRunning = await isChatGPTRunning();
	
	if (isRunning) {
		return { success: true, data: "ChatGPT already running" };
	}
	
	const script = `
		tell application "ChatGPT"
			activate
		end tell
		delay 3
		return "ChatGPT launched"
	`;
	
	return await runAppleScript(script);
}

/**
 * Get ChatGPT app version for debugging
 */
export async function getChatGPTVersion(): Promise<string> {
	const script = `
		tell application "ChatGPT"
			return version
		end tell
	`;
	
	const result = await runAppleScript(script, 1);
	return result.success ? result.data || "unknown" : "unknown";
}