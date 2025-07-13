/**
 * Retry utilities - CommonJS Version
 */

const { shouldRetry, getRetryDelay } = require('./error-handling.js');

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff(fn, maxAttempts = 3, baseDelay = 1000) {
	let lastError;
	
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			
			if (!shouldRetry(error, attempt, maxAttempts)) {
				throw error;
			}
			
			if (attempt < maxAttempts) {
				const delay = getRetryDelay(attempt, baseDelay);
				console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms: ${error.message}`);
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}
	}
	
	throw lastError;
}

/**
 * Retry specifically for AppleScript operations
 */
async function retryAppleScript(scriptFn, maxAttempts = 3) {
	return retryWithBackoff(scriptFn, maxAttempts, 1000);
}

/**
 * Retry for file operations
 */
async function retryFileOperation(fileFn, maxAttempts = 2) {
	return retryWithBackoff(fileFn, maxAttempts, 500);
}

module.exports = {
	retryWithBackoff,
	retryAppleScript,
	retryFileOperation
};