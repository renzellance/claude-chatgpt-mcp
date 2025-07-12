/**
 * Retry logic utilities
 */

import { ChatGPTError } from '../core/types.js';
import { CONFIG } from '../core/config.js';
import { createError, isRetryableError, logError } from './error-handling.js';

/**
 * Sleep utility for retry delays
 */
export const sleep = (ms: number): Promise<void> => 
	new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateDelay(attempt: number): number {
	const { baseDelay, maxDelay, backoffFactor } = CONFIG.retry;
	const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
	// Add jitter to prevent thundering herd
	return delay + Math.random() * 1000;
}

/**
 * Enhanced retry wrapper with exponential backoff
 */
export async function withRetry<T>(
	operation: () => Promise<T>,
	operationName: string,
	maxRetries: number = CONFIG.retry.maxRetries
): Promise<T> {
	let lastError: ChatGPTError;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			console.log(`[${operationName}] Attempt ${attempt + 1}/${maxRetries + 1}`);
			const result = await operation();
			if (attempt > 0) {
				console.log(`[${operationName}] Succeeded on retry ${attempt}`);
			}
			return result;
		} catch (error) {
			lastError = error as ChatGPTError;
			
			// Log the error for debugging
			logError(lastError, `${operationName}:attempt${attempt + 1}`);

			// Don't retry if this is the last attempt or error is not retryable
			if (attempt === maxRetries || !isRetryableError(lastError)) {
				break;
			}

			// Calculate delay and wait before retry
			const delay = calculateDelay(attempt);
			console.log(`[${operationName}] Retrying in ${Math.round(delay)}ms...`);
			await sleep(delay);
		}
	}

	// If we get here, all retries failed
	throw createError(
		`${operationName} failed after ${maxRetries + 1} attempts. Last error: ${lastError.message}`,
		lastError.code,
		false
	);
}
