/**
 * Error handling utilities - CommonJS Version
 */

/**
 * Get error message with solution suggestions
 */
function getErrorWithSolution(error) {
	const message = error.message || String(error);
	const lowerMessage = message.toLowerCase();
	
	// Common error patterns and solutions
	if (lowerMessage.includes('application is not running') || lowerMessage.includes('chatgpt')) {
		return `❌ ChatGPT Error: ${message}\n\n🔧 Solution: Make sure the ChatGPT desktop app is running and you're logged in.`;
	}
	
	if (lowerMessage.includes('permission') || lowerMessage.includes('accessibility')) {
		return `❌ Permission Error: ${message}\n\n🔧 Solution: Grant Accessibility permissions to Terminal/iTerm in System Preferences > Privacy & Security > Accessibility.`;
	}
	
	if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
		return `❌ Timeout Error: ${message}\n\n🔧 Solution: The operation took too long. Try again or check if ChatGPT is responding normally.`;
	}
	
	if (lowerMessage.includes('no images found')) {
		return `❌ Image Error: ${message}\n\n🔧 Solution: Generate an image first using ChatGPT Plus, then try downloading it.`;
	}
	
	if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
		return `❌ Network Error: ${message}\n\n🔧 Solution: Check your internet connection and ensure ChatGPT Plus is active.`;
	}
	
	if (lowerMessage.includes('file') || lowerMessage.includes('download')) {
		return `❌ File Error: ${message}\n\n🔧 Solution: Check file permissions and ensure the download directory exists.`;
	}
	
	if (lowerMessage.includes('generation id') || lowerMessage.includes('not found')) {
		return `❌ Generation Error: ${message}\n\n🔧 Solution: Generation IDs expire after 1 hour. Start a new generation or use get_latest_image().`;
	}
	
	// Generic error with basic troubleshooting
	return `❌ Error: ${message}\n\n🔧 Troubleshooting:\n1. Ensure ChatGPT desktop app is running\n2. Check Accessibility permissions\n3. Try restarting both Claude and ChatGPT\n4. Verify ChatGPT Plus subscription is active`;
}

/**
 * Categorize error for retry logic
 */
function categorizeError(error) {
	const message = (error.message || String(error)).toLowerCase();
	
	if (message.includes('timeout') || message.includes('busy') || message.includes('temporary')) {
		return 'retryable';
	}
	
	if (message.includes('permission') || message.includes('accessibility')) {
		return 'permission';
	}
	
	if (message.includes('not running') || message.includes('application')) {
		return 'app_state';
	}
	
	return 'unknown';
}

/**
 * Check if error should trigger retry
 */
function shouldRetry(error, attempt, maxAttempts) {
	if (attempt >= maxAttempts) return false;
	
	const category = categorizeError(error);
	return category === 'retryable';
}

/**
 * Get retry delay with exponential backoff
 */
function getRetryDelay(attempt, baseDelay = 1000) {
	return Math.min(baseDelay * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
}

module.exports = {
	getErrorWithSolution,
	categorizeError,
	shouldRetry,
	getRetryDelay
};