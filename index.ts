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
		.replace(/[^a-z0-9\s]/g, '')
		.replace(/\s+/g, '_')
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
			return text.replace(/\"/g, '\\"');
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
								set promptPattern to "${prompt.replace(/"/g, '\\"').replace(/\n/g, ' ')}"
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

// Enhanced image generation with download capability
async function generateImage(
	prompt: string,
	style?: string,
	size?: string,
	conversationId?: string,
	downloadImage: boolean = true,
	customSavePath?: string,
): Promise<{ response: string; imagePath?: string }> {
	return withRetry(async () => {
		await checkChatGPTAccess();
		
		// Construct the image generation prompt
		let imagePrompt = prompt;
		if (style) imagePrompt += ` in ${style} style`;
		if (size) imagePrompt += ` (${size})`;
		const fullPrompt = `Please generate an image using DALL-E: ${imagePrompt}`;
		
		const encodeForAppleScript = (text: string): string => {
			return text.replace(/\"/g, '\\"');
		};

		const encodedPrompt = encodeForAppleScript(fullPrompt);
		
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
							
							-- Wait longer for image generation
							set maxWaitTime to 300 -- 5 minutes
							set waitInterval to 2
							set totalWaitTime to 0
							set previousText to ""
							set stableCount to 0
							set requiredStableChecks to 5
							
							repeat while totalWaitTime < maxWaitTime
								delay waitInterval
								set totalWaitTime to totalWaitTime + waitInterval
								
								-- Get current text and check for image indicators
								set frontWin to front window
								set allUIElements to entire contents of frontWin
								set conversationText to {}
								set hasImage to false
								
								repeat with e in allUIElements
									try
										if (role of e) is "AXStaticText" then
											set end of conversationText to (description of e)
										else if (role of e) is "AXImage" then
											set hasImage to true
										end if
									on error
										-- Silently continue if element access fails
									end try
								end repeat
								
								set AppleScript's text item delimiters to linefeed
								set currentText to conversationText as text
								
								-- Check for image generation completion
								if hasImage and (currentText contains "I've generated" or currentText contains "Here's the image" or currentText contains "I've created") then
									exit repeat
								end if
								
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
								
								-- Check for generation indicators
								if currentText contains "▍" or currentText contains "Generating" or currentText contains "Creating" then
									set stableCount to 0
								end if
							end repeat
							
							-- Return response
							if (count of conversationText) = 0 then
								error "No response found after waiting. Image generation may have failed."
							else
								set AppleScript's text item delimiters to linefeed
								set fullText to conversationText as text
								
								-- Check if we actually got an image
								if not hasImage and not (fullText contains "I've generated" or fullText contains "Here's the image" or fullText contains "I've created") then
									error "Image generation appears to have failed. Response: " & fullText
								end if
								
								return {fullText, hasImage}
							end if
						end tell
					end tell
				end tell
			`;
			
			const result = await runAppleScript(script);
			
			// Parse the result to extract text and image status
			let responseText = "";
			let hasImage = false;
			
			if (typeof result === 'string') {
				responseText = result;
				hasImage = result.includes("I've generated") || result.includes("Here's the image") || result.includes("I've created");
			} else if (Array.isArray(result) && result.length >= 2) {
				responseText = result[0];
				hasImage = result[1] === true || result[1] === "true";
			}
			
			// Restore original clipboard content
			if (originalClipboard) {
				try {
					await runAppleScript(`set the clipboard to "${encodedOriginalClipboard}"`);
				} catch (restoreError) {
					console.warn("Could not restore clipboard content:", restoreError);
				}
			}
			
			// Process the result
			let cleanedResult = responseText
				.replace(/Regenerate( response)?/g, '')
				.replace(/Continue generating/g, '')
				.replace(/▍/g, '')
				.trim();
			
			if (!cleanedResult) {
				throw createChatGPTError(
					"Received empty response from ChatGPT during image generation",
					"EMPTY_IMAGE_RESPONSE",
					true
				);
			}
			
			// Download image if requested and available
			let imagePath: string | undefined;
			if (downloadImage && hasImage) {
				try {
					const downloadPath = ensureDownloadDirectory(customSavePath);
					const filename = generateImageFilename(prompt, style);
					imagePath = await downloadImageFromChatGPT(downloadPath, filename);
					console.log(`Image downloaded successfully: ${imagePath}`);
				} catch (downloadError) {
					console.warn("Failed to download image:", downloadError);
					cleanedResult += `\n\nNote: Image generation succeeded but download failed: ${downloadError instanceof Error ? downloadError.message : String(downloadError)}`;
				}
			}
			
			return { response: cleanedResult, imagePath };
			
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
					"Lost connection to ChatGPT interface during image generation",
					"CONNECTION_LOST",
					true
				);
			}
			
			throw error;
		}
	}, "generateImage");
}

// Enhanced conversation retrieval
async function getConversations(): Promise<string[]> {
	return withRetry(async () => {
		const result = await runAppleScript(`
			-- Check if ChatGPT is running
			tell application "System Events"
				if not (application process "ChatGPT" exists) then
					error "ChatGPT is not running"
				end if
			end tell

			tell application "ChatGPT"
				activate
				delay 2.5

				tell application "System Events"
					tell process "ChatGPT"
						-- Check if ChatGPT window exists
						if not (exists window 1) then
							error "No ChatGPT window found"
						end if
						
						-- Try to get conversation titles
						set conversationsList to {}
						
						try
							-- First attempt: try buttons in group 1 of group 1
							if exists group 1 of group 1 of window 1 then
								set chatButtons to buttons of group 1 of group 1 of window 1
								repeat with chatButton in chatButtons
									try
										set buttonName to name of chatButton
										if buttonName is not "New chat" and buttonName is not "" then
											set end of conversationsList to buttonName
										end if
									on error
										-- Skip buttons that can't be accessed
									end try
								end repeat
							end if
							
							-- If we didn't find any conversations, try an alternative approach
							if (count of conversationsList) is 0 then
								set uiElements to UI elements of window 1
								repeat with elem in uiElements
									try
										if exists (attribute "AXDescription" of elem) then
											set elemDesc to value of attribute "AXDescription" of elem
											if elemDesc is not "New chat" and elemDesc is not "" then
												set end of conversationsList to elemDesc
											end if
										end if
									on error
										-- Skip elements that can't be accessed
									end try
								end repeat
							end if
							
							-- Return the list
							return conversationsList
						on error errMsg
							error "Error retrieving conversations: " & errMsg
						end try
					end tell
				end tell
			end tell
		`);

		// Parse the AppleScript result
		if (typeof result === "string") {
			if (result === "ChatGPT is not running") {
				throw createChatGPTError("ChatGPT application is not running", "APP_NOT_RUNNING", false);
			} else if (result.includes("No ChatGPT window found")) {
				throw createChatGPTError("No ChatGPT window found", "NO_WINDOW", true);
			} else if (result.startsWith("Error")) {
				throw createChatGPTError(result, "RETRIEVAL_ERROR", true);
			}
		}
		
		// Handle array results
		if (Array.isArray(result)) {
			return result;
		}
		
		// Handle comma-separated string results
		if (typeof result === "string" && result.includes(",")) {
			return result.split(", ").filter(conv => conv.trim() !== "");
		}
		
		// Empty result
		return [];
	}, "getConversations");
}

function isChatGPTArgs(args: unknown): args is {
	operation: "ask" | "get_conversations" | "generate_image";
	prompt?: string;
	conversation_id?: string;
	image_style?: string;
	image_size?: string;
	max_retries?: number;
	download_image?: boolean;
	save_path?: string;
} {
	if (typeof args !== "object" || args === null) return false;

	const { operation, prompt, conversation_id, image_style, image_size, max_retries, download_image, save_path } = args as any;

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

	return true;
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [CHATGPT_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	try {
		const { name, arguments: args } = request.params;

		if (!args) {
			throw new Error("No arguments provided");
		}

		if (name === "chatgpt") {
			if (!isChatGPTArgs(args)) {
				throw new Error("Invalid arguments for ChatGPT tool");
			}

			const maxRetries = args.max_retries ?? RETRY_CONFIG.maxRetries;

			switch (args.operation) {
				case "ask": {
					if (!args.prompt) {
						throw new Error("Prompt is required for ask operation");
					}

					const response = await askChatGPT(args.prompt, args.conversation_id);

					return {
						content: [
							{
								type: "text",
								text: response || "No response received from ChatGPT.",
							},
						],
						isError: false,
					};
				}

				case "generate_image": {
					if (!args.prompt) {
						throw new Error("Prompt is required for generate_image operation");
					}

					const downloadImage = args.download_image ?? true; // Default to true for image generation
					const result = await generateImage(
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

					return {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
						isError: false,
					};
				}

				case "get_conversations": {
					const conversations = await getConversations();

					return {
						content: [
							{
								type: "text",
								text:
									conversations.length > 0
										? `Found ${conversations.length} conversation(s):\n\n${conversations.join("\n")}`
										: "No conversations found in ChatGPT.",
							},
						],
						isError: false,
					};
				}

				default:
					throw new Error(`Unknown operation: ${args.operation}`);
			}
		}

		return {
			content: [{ type: "text", text: `Unknown tool: ${name}` }],
			isError: true,
		};
	} catch (error) {
		const chatGPTError = error as ChatGPTError;
		let errorMessage = `Error: ${chatGPTError.message}`;
		
		// Add helpful context based on error codes
		if (chatGPTError.code) {
			switch (chatGPTError.code) {
				case "ACCESSIBILITY_DENIED":
					errorMessage += "\n\nTo fix this:\n1. Open System Preferences > Privacy & Security > Accessibility\n2. Add Terminal (or iTerm) to the list\n3. Enable the checkbox for Terminal\n4. Restart Claude Desktop";
					break;
				case "APP_NOT_RUNNING":
					errorMessage += "\n\nPlease start the ChatGPT desktop app and try again.";
					break;
				case "NO_WINDOW":
					errorMessage += "\n\nPlease ensure ChatGPT is fully loaded with a visible window.";
					break;
			}
		}
		
		return {
			content: [
				{
					type: "text",
					text: errorMessage,
				},
			],
			isError: true,
		};
	}
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Enhanced ChatGPT MCP Server with image download running on stdio");
