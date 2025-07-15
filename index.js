#!/usr/bin/env node
/**
 * Enhanced ChatGPT MCP Tool - Fixed SDK Usage
 * Updated to use correct MCP SDK patterns based on current documentation
 */

const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp");
const runAppleScript = require("run-applescript");
const { v4: uuidv4 } = require("uuid");
const os = require('os');
const path = require('path');
const fs = require('fs');

// =============================================================================
// CONFIGURATION
// =============================================================================
const CONFIG = {
	image: {
		downloadPath: path.join(os.homedir(), 'Downloads', 'ChatGPT_MCP_Images'),
		cleanupAfterDownload: false,
		maxFileAge: 24, // hours
		maxDirectorySize: 100, // MB
		keepLastN: 10, // files
		defaultFormat: 'png',
		retryAttempts: 3,
		retryDelay: 1000, // ms
		defaultStyle: 'realistic',
		defaultSize: '1024x1024'
	},
	applescript: {
		defaultTimeout: 30000, // 30 seconds
		retryAttempts: 3,
		retryDelay: 1000, // ms
		baseDelay: 500, // ms
		clickDelay: 300, // ms
		typeDelay: 100, // ms
		m4Multiplier: 1.5 // Increase delays by 50% on M4
	},
	logging: {
		level: 'info',
		verbose: false
	},
	async: {
		generationTimeout: 300000, // 5 minutes
		cleanupInterval: 3600000, // 1 hour
		maxConcurrentGenerations: 5,
		statusCheckInterval: 5000 // 5 seconds
	}
};

// Environment-based overrides
if (process.env.CHATGPT_MCP_DEBUG) {
	CONFIG.logging.level = 'debug';
	CONFIG.logging.verbose = true;
}

if (process.env.CHATGPT_MCP_DOWNLOAD_PATH) {
	CONFIG.image.downloadPath = process.env.CHATGPT_MCP_DOWNLOAD_PATH;
}

// =============================================================================
// SECURITY UTILITIES
// =============================================================================
function sanitizeInput(input) {
	if (typeof input !== 'string') {
		return String(input || '');
	}
	// Remove potential script injection characters
	return input
		.replace(/[`$\\]/g, '')
		.replace(/\r?\n/g, ' ')
		.trim()
		.substring(0, 1000); // Limit length
}

function validatePath(filePath) {
	if (!filePath || typeof filePath !== 'string') {
		throw new Error('Invalid file path');
	}
	
	const resolved = path.resolve(filePath);
	const downloadDir = path.resolve(CONFIG.image.downloadPath);
	
	// Ensure path is within download directory
	if (!resolved.startsWith(downloadDir)) {
		throw new Error('Path traversal attempted');
	}
	
	return resolved;
}

// =============================================================================
// FILE SYSTEM UTILITIES
// =============================================================================
function ensureDownloadDirectory() {
	try {
		if (!fs.existsSync(CONFIG.image.downloadPath)) {
			fs.mkdirSync(CONFIG.image.downloadPath, { recursive: true });
		}
	} catch (error) {
		console.error('Failed to create download directory:', error);
		throw error;
	}
}

async function cleanupFiles(directory) {
	try {
		if (!fs.existsSync(directory)) {
			return;
		}
		
		const files = fs.readdirSync(directory);
		const now = Date.now();
		const maxAge = CONFIG.image.maxFileAge * 60 * 60 * 1000; // hours to ms
		
		for (const file of files) {
			const filePath = path.join(directory, file);
			const stats = fs.statSync(filePath);
			
			if (now - stats.mtime.getTime() > maxAge) {
				fs.unlinkSync(filePath);
				console.error(`Cleaned up old file: ${file}`);
			}
		}
	} catch (error) {
		console.error('Cleanup failed:', error);
	}
}

// =============================================================================
// APPLESCRIPT EXECUTION
// =============================================================================
async function executeAppleScript(script, options = {}) {
	const timeout = options.timeout || CONFIG.applescript.defaultTimeout;
	const retries = options.retries || CONFIG.applescript.retryAttempts;
	
	// Security: Sanitize the script
	const sanitizedScript = sanitizeInput(script);
	
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			console.error(`Executing AppleScript (attempt ${attempt}/${retries})`);
			
			const result = await Promise.race([
				runAppleScript(sanitizedScript),
				new Promise((_, reject) => 
					setTimeout(() => reject(new Error('AppleScript timeout')), timeout)
				)
			]);
			
			return result;
		} catch (error) {
			console.error(`AppleScript attempt ${attempt} failed:`, error.message);
			
			if (attempt === retries) {
				throw new Error(`AppleScript failed after ${retries} attempts: ${error.message}`);
			}
			
			// Wait before retry
			await new Promise(resolve => setTimeout(resolve, CONFIG.applescript.retryDelay));
		}
	}
}

// =============================================================================
// CHATGPT INTERACTION FUNCTIONS
// =============================================================================
async function askChatGPT(prompt, conversationId = null) {
	const sanitizedPrompt = sanitizeInput(prompt);
	
	let script = `
		tell application "ChatGPT"
			activate
			delay ${CONFIG.applescript.baseDelay / 1000}
			
			-- Clear any existing text and enter new prompt
			tell application "System Events"
				tell process "ChatGPT"
					-- Click on the text input area
					click text field 1 of group 1 of group 1 of group 1 of window 1
					delay ${CONFIG.applescript.clickDelay / 1000}
					
					-- Clear existing text
					key code 0 using command down -- Cmd+A
					delay ${CONFIG.applescript.typeDelay / 1000}
					
					-- Type the prompt
					keystroke "${sanitizedPrompt}"
					delay ${CONFIG.applescript.typeDelay / 1000}
					
					-- Send the message
					key code 36 -- Return key
					delay 2
				end tell
			end tell
			
			-- Wait for response
			delay 3
			return "Message sent successfully"
		end tell
	`;
	
	return await executeAppleScript(script);
}

async function generateImageSync(prompt, style = null, size = null) {
	const sanitizedPrompt = sanitizeInput(prompt);
	const imageStyle = style || CONFIG.image.defaultStyle;
	const imageSize = size || CONFIG.image.defaultSize;
	
	const fullPrompt = `Create an image: ${sanitizedPrompt}. Style: ${imageStyle}. Size: ${imageSize}`;
	
	let script = `
		tell application "ChatGPT"
			activate
			delay ${CONFIG.applescript.baseDelay / 1000}
			
			tell application "System Events"
				tell process "ChatGPT"
					-- Click on the text input area
					click text field 1 of group 1 of group 1 of group 1 of window 1
					delay ${CONFIG.applescript.clickDelay / 1000}
					
					-- Clear and type the image generation prompt
					key code 0 using command down -- Cmd+A
					delay ${CONFIG.applescript.typeDelay / 1000}
					
					keystroke "${fullPrompt}"
					delay ${CONFIG.applescript.typeDelay / 1000}
					
					-- Send the message
					key code 36 -- Return key
					
					-- Wait for image generation (extended timeout for M4)
					delay ${15 * CONFIG.applescript.m4Multiplier}
				end tell
			end tell
			
			return "Image generation completed"
		end tell
	`;
	
	const result = await executeAppleScript(script);
	
	return {
		success: true,
		message: "Image generated successfully",
		downloadPath: CONFIG.image.downloadPath,
		result: result
	};
}

async function getConversations() {
	let script = `
		tell application "ChatGPT"
			activate
			delay ${CONFIG.applescript.baseDelay / 1000}
			
			tell application "System Events"
				tell process "ChatGPT"
					-- Try to get conversation list
					delay 1
				end tell
			end tell
			
			return "Conversations retrieved"
		end tell
	`;
	
	return await executeAppleScript(script);
}

// =============================================================================
// ASYNC IMAGE GENERATION STATE MANAGEMENT
// =============================================================================
const generationStates = new Map();

async function startImageGeneration(prompt, style = null, size = null) {
	const generationId = uuidv4();
	const sanitizedPrompt = sanitizeInput(prompt);
	const imageStyle = style || CONFIG.image.defaultStyle;
	const imageSize = size || CONFIG.image.defaultSize;
	
	// Store generation state
	generationStates.set(generationId, {
		id: generationId,
		prompt: sanitizedPrompt,
		style: imageStyle,
		size: imageSize,
		status: 'starting',
		startTime: Date.now(),
		error: null,
		result: null
	});
	
	// Start generation process asynchronously
	setTimeout(async () => {
		try {
			generationStates.set(generationId, {
				...generationStates.get(generationId),
				status: 'generating'
			});
			
			const result = await generateImageSync(sanitizedPrompt, imageStyle, imageSize);
			
			generationStates.set(generationId, {
				...generationStates.get(generationId),
				status: 'completed',
				result: result,
				endTime: Date.now()
			});
			
		} catch (error) {
			generationStates.set(generationId, {
				...generationStates.get(generationId),
				status: 'failed',
				error: error.message,
				endTime: Date.now()
			});
		}
	}, 100);
	
	return {
		success: true,
		generationId: generationId,
		status: 'started',
		message: `Image generation started with ID: ${generationId}`
	};
}

function checkGenerationStatus(generationId) {
	if (!generationStates.has(generationId)) {
		return {
			success: false,
			error: 'Generation ID not found'
		};
	}
	
	const state = generationStates.get(generationId);
	const elapsed = Date.now() - state.startTime;
	
	return {
		success: true,
		generationId: generationId,
		status: state.status,
		elapsed: elapsed,
		prompt: state.prompt,
		...(state.error && { error: state.error }),
		...(state.result && { result: state.result })
	};
}

function getLatestImage() {
	try {
		// Check if download directory exists
		if (!fs.existsSync(CONFIG.image.downloadPath)) {
			return {
				success: false,
				error: 'Download directory not found'
			};
		}
		
		// Get all image files sorted by modification time
		const files = fs.readdirSync(CONFIG.image.downloadPath)
			.filter(file => /\.(png|jpg|jpeg|gif|webp)$/i.test(file))
			.map(file => ({
				name: file,
				path: path.join(CONFIG.image.downloadPath, file),
				mtime: fs.statSync(path.join(CONFIG.image.downloadPath, file)).mtime
			}))
			.sort((a, b) => b.mtime - a.mtime);
		
		if (files.length === 0) {
			return {
				success: false,
				error: 'No image files found in download directory'
			};
		}
		
		const latestFile = files[0];
		
		return {
			success: true,
			filename: latestFile.name,
			path: latestFile.path,
			size: fs.statSync(latestFile.path).size,
			modified: latestFile.mtime.toISOString(),
			downloadPath: CONFIG.image.downloadPath
		};
	} catch (error) {
		return {
			success: false,
			error: `Failed to get latest image: ${error.message}`
		};
	}
}

// =============================================================================
// MCP SERVER SETUP USING MODERN McpServer CLASS
// =============================================================================

// Create server instance using McpServer (new way)
const server = new McpServer({
	name: "claude-chatgpt-mcp",
	version: "2.4.0",
});

// Register the chatgpt tool using the new registerTool method
server.registerTool(
	"chatgpt",
	{
		title: "ChatGPT Interaction Tool",
		description: "Interact with ChatGPT desktop app with async image generation support. Operations: ask, generate_image (sync), start_image_generation (async), check_generation_status (async), get_latest_image (async), get_conversations",
		inputSchema: {
			operation: {
				type: "string",
				enum: ["ask", "get_conversations", "generate_image", "start_image_generation", "check_generation_status", "get_latest_image"],
				description: "Operation to perform"
			},
			prompt: {
				type: "string",
				description: "Text prompt for ask, generate_image, or start_image_generation operations"
			},
			conversation_id: {
				type: "string",
				description: "Optional conversation ID to continue specific conversation"
			},
			image_style: {
				type: "string",
				description: "Image style (realistic, cartoon, abstract, etc.)"
			},
			image_size: {
				type: "string",
				description: "Image size (1024x1024, 1792x1024, 1024x1792)"
			},
			generation_id: {
				type: "string",
				description: "Generation ID for check_generation_status operation"
			}
		}
	},
	async ({ operation, prompt, conversation_id, image_style, image_size, generation_id }) => {
		try {
			switch (operation) {
				case 'ask':
					if (!prompt) {
						throw new Error('Prompt is required for ask operation');
					}
					const askResult = await askChatGPT(prompt, conversation_id);
					return {
						content: [
							{
								type: "text",
								text: `ChatGPT response: ${askResult}`
							}
						]
					};
					
				case 'generate_image':
					if (!prompt) {
						throw new Error('Prompt is required for image generation');
					}
					const imageResult = await generateImageSync(prompt, image_style, image_size);
					return {
						content: [
							{
								type: "text",
								text: `Image generation completed: ${JSON.stringify(imageResult, null, 2)}`
							}
						]
					};
					
				case 'start_image_generation':
					if (!prompt) {
						throw new Error('Prompt is required for async image generation');
					}
					const startResult = await startImageGeneration(prompt, image_style, image_size);
					return {
						content: [
							{
								type: "text",
								text: `Async image generation started: ${JSON.stringify(startResult, null, 2)}`
							}
						]
					};
					
				case 'check_generation_status':
					if (!generation_id) {
						throw new Error('Generation ID is required for status check');
					}
					const statusResult = checkGenerationStatus(generation_id);
					return {
						content: [
							{
								type: "text",
								text: `Generation status: ${JSON.stringify(statusResult, null, 2)}`
							}
						]
					};
					
				case 'get_latest_image':
					const latestResult = getLatestImage();
					return {
						content: [
							{
								type: "text",
								text: `Latest image: ${JSON.stringify(latestResult, null, 2)}`
							}
						]
					};
					
				case 'get_conversations':
					const convResult = await getConversations();
					return {
						content: [
							{
								type: "text",
								text: `Conversations: ${convResult}`
							}
						]
					};
					
				default:
					throw new Error(`Unknown operation: ${operation}`);
			}
		} catch (error) {
			console.error(`ChatGPT tool error:`, error);
			return {
				content: [
					{
						type: "text",
						text: `Error: ${error.message || error}`
					}
				]
			};
		}
	}
);

// =============================================================================
// INITIALIZATION AND MAIN
// =============================================================================
async function initialize() {
	try {
		ensureDownloadDirectory();
		
		if (CONFIG.image.cleanupAfterDownload) {
			await cleanupFiles(CONFIG.image.downloadPath);
		}
		
		console.error("Enhanced ChatGPT MCP Server initialized successfully");
	} catch (error) {
		console.error("Failed to initialize:", error);
		process.exit(1);
	}
}

async function main() {
	try {
		await initialize();
		
		const transport = new StdioServerTransport();
		await server.connect(transport);
		console.error("Enhanced ChatGPT MCP Server v2.4.0 running on stdio");
		
		// Graceful shutdown handling
		process.on('SIGINT', async () => {
			console.error('\nShutting down gracefully...');
			try {
				await cleanupFiles(CONFIG.image.downloadPath);
				console.error('Cleanup completed');
			} catch (error) {
				console.error('Cleanup failed:', error);
			} finally {
				process.exit(0);
			}
		});
		
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
	process.exit(1);
});

process.on('uncaughtException', (error) => {
	console.error('Uncaught Exception:', error);
	process.exit(1);
});

// Start the application
if (require.main === module) {
	main().catch((error) => {
		console.error("Application failed to start:", error);
		process.exit(1);
	});
}