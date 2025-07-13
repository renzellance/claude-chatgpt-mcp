/**
 * AppleScript utilities - CommonJS Version WITH SECURITY HARDENING
 */

const { runAppleScript: runAppleScriptNative } = require('run-applescript');
const { CONFIG } = require('../core/config');

/**
 * SECURITY: Sanitize prompts before AppleScript execution
 * Prevents injection attacks via malicious prompts
 */
function sanitizePromptForAppleScript(prompt) {
	if (typeof prompt !== 'string') {
		throw new Error('Prompt must be a string');
	}
	
	return prompt
		// Escape dangerous characters
		.replace(/\\/g, '\\\\')    // Escape backslashes
		.replace(/"/g, '\\"')     // Escape quotes
		.replace(/`/g, '\\`')     // Escape backticks
		.replace(/\$/g, '\\$')    // Escape dollar signs
		.replace(/\n/g, ' ')      // Replace newlines with spaces
		.replace(/\r/g, ' ')      // Replace carriage returns
		.replace(/\t/g, ' ')      // Replace tabs
		// Remove any remaining control characters
		.replace(/[\x00-\x1F\x7F]/g, '')
		// Limit length to prevent buffer overflow
		.slice(0, 1000)
		.trim();
}

/**
 * SECURITY: Validate AppleScript execution parameters
 */
function validateAppleScriptExecution(script, retries = 3) {
	if (typeof script !== 'string' || script.length === 0) {
		throw new Error('AppleScript must be a non-empty string');
	}
	
	if (script.length > 10000) {
		throw new Error('AppleScript too long - potential security risk');
	}
	
	if (retries < 1 || retries > 10) {
		throw new Error('Invalid retry count - must be between 1 and 10');
	}
	
	// Check for suspicious patterns
	const suspiciousPatterns = [
		/do shell script/i,
		/system events.*key code.*[0-9]{2,}/,
		/\bsudo\b/i,
		/\brm\s+-rf/i,
		/\bcurl\b.*http/i
	];
	
	for (const pattern of suspiciousPatterns) {
		if (pattern.test(script)) {
			console.warn('⚠️ Potentially suspicious AppleScript pattern detected');
			// Log but don't block - could be legitimate
		}
	}
	
	return true;
}

/**
 * Execute AppleScript with error handling and retries + SECURITY
 */
async function runAppleScript(script, retries = 3) {
	// SECURITY: Validate execution parameters
	validateAppleScriptExecution(script, retries);
	
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			const result = await runAppleScriptNative(script);
			
			return {
				success: true,
				data: result
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			
			// SECURITY: Don't log full AppleScript in errors
			console.warn(`AppleScript execution failed (attempt ${attempt}): ${errorMessage.slice(0, 100)}...`);
			
			// If this isn't the last attempt and it's a retryable error, wait and retry
			if (attempt < retries && isRetryableError(errorMessage)) {
				const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
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
 * SECURE: Execute AppleScript with user input sanitization
 */
async function runAppleScriptWithUserInput(scriptTemplate, userInput, retries = 3) {
	if (typeof scriptTemplate !== 'string') {
		throw new Error('Script template must be a string');
	}
	
	// SECURITY: Sanitize user input
	const sanitizedInput = sanitizePromptForAppleScript(userInput);
	
	// Replace placeholder with sanitized input
	const script = scriptTemplate.replace('{{USER_INPUT}}', sanitizedInput);
	
	return await runAppleScript(script, retries);
}

/**
 * Check if an error is retryable
 */
function isRetryableError(errorMessage) {
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
async function isChatGPTRunning() {
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
async function ensureChatGPTRunning() {
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
async function getChatGPTVersion() {
	const script = `
		tell application "ChatGPT"
			return version
		end tell
	`;
	
	const result = await runAppleScript(script, 1);
	return result.success ? result.data || "unknown" : "unknown";
}

module.exports = {
	runAppleScript,
	runAppleScriptWithUserInput,
	sanitizePromptForAppleScript,
	isChatGPTRunning,
	ensureChatGPTRunning,
	getChatGPTVersion
};
