#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { runAppleScript } from "run-applescript";
import { run } from "@jxa/run";
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Enhanced error types for better error handling
interface ChatGPTError extends Error {
	code?: string;
	retryable?: boolean;
}

// Configuration for retry logic
const RETRY_CONFIG = {
	maxRetries: 3,
	baseDelay: 1000, // 1 second
	maxDelay: 10000, // 10 seconds
	backoffFactor: 2,
};

// Configuration for image handling
const IMAGE_CONFIG = {
	downloadPath: path.join(os.homedir(), 'Downloads', 'ChatGPT_Images'),
	supportedFormats: ['.png', '.jpg', '.jpeg', '.webp'],
	maxDownloadWaitTime: 30000, // 30 seconds
};

// Define the ChatGPT tool with enhanced operations
const CHATGPT_TOOL: Tool = {
	name: "chatgpt",
	description: "Interact with the ChatGPT desktop app on macOS including image generation with download and retry logic",
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
				description:
					"The prompt to send to ChatGPT (required for ask and generate_image operations)",
			},
			conversation_id: {
				type: "string",
				description:
					"Optional conversation ID to continue a specific conversation",
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
		},
		required: ["operation"],
	},
};

const server = new Server(
	{
		name: "ChatGPT MCP Tool with Image Download",
		version: "1.3.0",
	},
	{
		capabilities: {
			tools: {},
		},
	},
);

// Enhanced error creation with retry logic
function createChatGPTError(message: string, code?: string, retryable: boolean = true): ChatGPTError {
	const error = new Error(message) as ChatGPTError;
	error.code = code;
	error.retryable = retryable;
	return error;
}

// Sleep utility for retry delays
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// Calculate exponential backoff delay
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number, backoffFactor: number): number {
	const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
	// Add jitter to prevent thundering herd
	return delay + Math.random() * 1000;
}

// Ensure download directory exists
function ensureDownloadDirectory(customPath?: string): string {
	const downloadPath = customPath || IMAGE_CONFIG.downloadPath;
	
	try {
		if (!fs.existsSync(downloadPath)) {
			fs.mkdirSync(downloadPath, { recursive: true });
			console.log(`Created download directory: ${downloadPath}`);
		}
		return downloadPath;
	} catch (error) {
		console.error(`Failed to create download directory: ${error}`);
		throw createChatGPTError(
			`Cannot create download directory: ${downloadPath}`,
			"DIRECTORY_CREATE_FAILED",
			false
		);
	}
}

// Generate unique filename for downloaded image
function generateImageFilename(prompt: string, style?: string): string {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const promptSlug = prompt
		.toLowerCase()
		.replace(/[^a-z0-9\\s]/g, '')
		.replace(/\\s+/g, '_')
		.substring(0, 50);
	
	const styleSlug = style ? `_${style.toLowerCase().replace(/[^a-z0-9]/g, '')}` : '';
	return `chatgpt_${timestamp}_${promptSlug}${styleSlug}.png`;
}

// Download image from ChatGPT interface
async function downloadImageFromChatGPT(downloadPath: string, filename: string): Promise<string> {
	try {
		const script = `
			tell application "ChatGPT"
				activate
				delay 1
				
				tell application "System Events"
					tell process "ChatGPT"
						-- Look for images in the conversation
						set frontWin to front window
						set allUIElements to entire contents of frontWin
						set imageElements to {}
						
						repeat with e in allUIElements
							try
								if (role of e) is "AXImage" then
									set end of imageElements to e
								end if
							on error
								-- Skip elements that can't be accessed
							end try
						end repeat
						
						-- If we found images, try to download the most recent one
						if (count of imageElements) > 0 then
							set latestImage to item -1 of imageElements
							
							-- Right-click on the image to open context menu
							tell latestImage
								perform action "AXShowMenu"
								delay 1
							end tell
							
							-- Look for "Save Image" or "Download" menu item
							repeat with menuItem in menu items of menu 1 of latestImage
								try
									set menuTitle to title of menuItem
									if menuTitle contains "Save" or menuTitle contains "Download" then
										click menuItem
										delay 2
										exit repeat
									end if
								on error
									-- Skip menu items that can't be accessed
								end try
							end repeat
							
							-- Handle save dialog
							delay 2
							if exists sheet 1 of frontWin then
								-- Set the filename
								set value of text field 1 of sheet 1 of frontWin to "${filename}"
								delay 0.5
								
								-- Navigate to download path
								keystroke "g" using {command down, shift down}
								delay 1
								
								if exists sheet 1 of sheet 1 of frontWin then
									set value of text field 1 of sheet 1 of sheet 1 of frontWin to "${downloadPath}"
									delay 0.5
									click button "Go" of sheet 1 of sheet 1 of frontWin
									delay 1
								end if
								
								-- Click Save
								click button "Save" of sheet 1 of frontWin
								delay 2
								
								return "Image download initiated"
							else
								return "No save dialog appeared"
							end if
						else
							return "No images found in conversation"
						end if
					end tell
				end tell
			end tell
		`;
		
		const result = await runAppleScript(script);
		
		// Wait for file to appear
		const fullPath = path.join(downloadPath, filename);
		const startTime = Date.now();
		
		while (Date.now() - startTime < IMAGE_CONFIG.maxDownloadWaitTime) {
			if (fs.existsSync(fullPath)) {
				console.log(`Image successfully downloaded: ${fullPath}`);
				return fullPath;
			}
			await sleep(1000);
		}
		
		throw createChatGPTError(
			"Image download timed out. File may still be downloading.",
			"DOWNLOAD_TIMEOUT",
			true
		);
		
	} catch (error) {
		if (error instanceof Error && error.message.includes("Invalid index")) {
			throw createChatGPTError(
				"Cannot access ChatGPT interface for image download",
				"DOWNLOAD_ACCESS_FAILED",
				true
			);
		}
		throw error;
	}
}

// Enhanced retry wrapper with exponential backoff
async function withRetry<T>(
	operation: () => Promise<T>,
	operationName: string,
	maxRetries: number = RETRY_CONFIG.maxRetries
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
			console.error(`[${operationName}] Attempt ${attempt + 1} failed:`, {
				message: lastError.message,
				code: lastError.code,
				retryable: lastError.retryable
			});

			// Don't retry if this is the last attempt or error is not retryable
			if (attempt === maxRetries || lastError.retryable === false) {
				break;
			}

			// Calculate delay and wait before retry
			const delay = calculateDelay(attempt, RETRY_CONFIG.baseDelay, RETRY_CONFIG.maxDelay, RETRY_CONFIG.backoffFactor);
			console.log(`[${operationName}] Retrying in ${Math.round(delay)}ms...`);
			await sleep(delay);
		}
	}

	// If we get here, all retries failed
	throw createChatGPTError(
		`${operationName} failed after ${maxRetries + 1} attempts. Last error: ${lastError.message}`,
		lastError.code,
		false
	);
}

// Enhanced ChatGPT access check with better error categorization
async function checkChatGPTAccess(): Promise<boolean> {
	try {
		const isRunning = await runAppleScript(`
			tell application "System Events"
				return application process "ChatGPT" exists
			end tell
		`);

		if (isRunning !== "true") {
			console.log("ChatGPT app is not running, attempting to launch...");
			try {
				await runAppleScript(`
					tell application "ChatGPT" to activate
					delay 3
				`);
			} catch (activateError) {
				console.error("Error activating ChatGPT app:", activateError);
				throw createChatGPTError(
					"Could not activate ChatGPT app. Please start it manually.",
					"ACTIVATION_FAILED",
					false // Not retryable - user intervention needed
				);
			}
		}

		// Additional check to ensure window is available
		try {
			await runAppleScript(`
				tell application "System Events"
					tell process "ChatGPT"
						if not (exists window 1) then
							error "No ChatGPT window found"
						end if
					end tell
				end tell
			`);
		} catch (windowError) {
			throw createChatGPTError(
				"ChatGPT is running but no window is available. Please ensure ChatGPT is fully loaded.",
				"NO_WINDOW",
				true // Retryable - might just need more time
			);
		}

		return true;
	} catch (error) {
		if ((error as ChatGPTError).code) {
			throw error; // Re-throw our custom errors
		}
		
		// Handle accessibility permission errors
		if (error instanceof Error && error.message.includes("Invalid index")) {
			throw createChatGPTError(
				"Cannot access ChatGPT interface. Please ensure Accessibility permissions are granted to Terminal/iTerm in System Preferences > Privacy & Security > Accessibility.",
				"ACCESSIBILITY_DENIED",
				false // Not retryable - user needs to fix permissions
			);
		}
		
		console.error("ChatGPT access check failed:", error);
		throw createChatGPTError(
			`Cannot access ChatGPT app: ${error instanceof Error ? error.message : String(error)}`,
			"ACCESS_FAILED",
			true // Retryable by default
		);
	}
}

// Enhanced function to send a prompt to ChatGPT with better error handling
async function askChatGPT(
	prompt: string,
	conversationId?: string,
): Promise<string> {
	return withRetry(async () => {
		await checkChatGPTAccess();
		
		// Function to properly encode text for AppleScript
		const encodeForAppleScript = (text: string): string => {
			return text.replace(/\\"/g, '\\\\"');
		};

		const encodedPrompt = encodeForAppleScript(prompt);
		
		// Save original clipboard content
		let originalClipboard = "";
		try {
			originalClipboard = await runAppleScript(`
				set savedClipboard to the clipboard
				return savedClipboard
			`);
		} catch (clipboardError) {
			console.warn("Could not save clipboard content:", clipboardError);
		}
		
		const encodedOriginalClipboard = encodeForAppleScript(originalClipboard);
		
		try {
			const script = `
				tell application "ChatGPT"
					activate
					delay 2
					tell application "System Events"
						tell process "ChatGPT"
							${conversationId ? `
								try
									click button "${conversationId}" of group 1 of group 1 of window 1
									delay 1
								end try
							` : ""}
							
							-- Clear any existing text in the input field
							keystroke "a" using {command down}
							keystroke (ASCII character 8) -- Delete key
							delay 0.5
							
							-- Set the clipboard to the prompt text
							set the clipboard to "${encodedPrompt}"
							
							-- Paste the prompt and send it
							keystroke "v" using {command down}
							delay 0.5
							keystroke return
							
							-- Wait for the response with enhanced detection
							set maxWaitTime to 180
							set waitInterval to 1
							set totalWaitTime to 0
							set previousText to ""
							set stableCount to 0
							set requiredStableChecks to 4
							
							repeat while totalWaitTime < maxWaitTime
								delay waitInterval
								set totalWaitTime to totalWaitTime + waitInterval
								
								-- Get current text with enhanced error handling
								set frontWin to front window
								set allUIElements to entire contents of frontWin
								set conversationText to {}
								repeat with e in allUIElements
									try
										if (role of e) is "AXStaticText" then
											set end of conversationText to (description of e)
										end if
									on error
										-- Silently continue if element access fails
									end try
								end repeat
								
								set AppleScript's text item delimiters to linefeed
								set currentText to conversationText as text
								
								-- Check if text has stabilized
								if currentText is equal to previousText then
									set stableCount to stableCount + 1
									if stableCount ≥ requiredStableChecks then
										exit repeat
									end if
								else
									set stableCount to 0
									set previousText to currentText
								end if
								
								-- Check for response completion indicators
								if currentText contains "▍" then
									set stableCount to 0
								else if currentText contains "Regenerate" or currentText contains "Continue generating" then
									set stableCount to stableCount + 1
								end if
							end repeat
							
							-- Return the response
							if (count of conversationText) = 0 then
								error "No response text found. ChatGPT may still be processing."
							else
								set AppleScript's text item delimiters to linefeed
								set fullText to conversationText as text
								
								-- Try to extract just the latest response
								set responseText to ""
								set promptPattern to "${prompt.replace(/"/g, '\\\\"').replace(/\\n/g, ' ')}"
								if fullText contains promptPattern then
									set promptPos to offset of promptPattern in fullText
									if promptPos > 0 then
										set responseText to text from (promptPos + (length of promptPattern)) to end of fullText
									end if
								end if
								
								if responseText is "" then
									set responseText to fullText
								end if
								
								return responseText
							end if
						end tell
					end tell
				end tell
			`;
			
			const result = await runAppleScript(script);
			
			// Restore original clipboard content
			if (originalClipboard) {
				try {
					await runAppleScript(`set the clipboard to "${encodedOriginalClipboard}"`);
				} catch (restoreError) {
					console.warn("Could not restore clipboard content:", restoreError);
				}
			}
			
			// Post-process the result
			let cleanedResult = result
				.replace(/Regenerate( response)?/g, '')
				.replace(/Continue generating/g, '')
				.replace(/▍/g, '')
				.trim();
			
			if (!cleanedResult) {
				throw createChatGPTError(
					"Received empty response from ChatGPT",
					"EMPTY_RESPONSE",
					true
				);
			}
			
			return cleanedResult;
			
		} catch (error) {
			// Restore clipboard on error
			if (originalClipboard) {
				try {
					await runAppleScript(`set the clipboard to "${encodedOriginalClipboard}"`);
				} catch (restoreError) {
					console.warn("Could not restore clipboard content after error:", restoreError);
				}
			}
			
			if (error instanceof Error && error.message.includes("Invalid index")) {
				throw createChatGPTError(
					"Lost connection to ChatGPT interface. The app may have been closed or changed.",
					"CONNECTION_LOST",
					true
				);
			}
			
			throw error;
		}
	}, "askChatGPT");
}