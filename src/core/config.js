/**
 * Configuration - CommonJS Version
 */

const os = require('os');
const path = require('path');

const CONFIG = {
	image: {
		// Default download directory
		downloadPath: path.join(os.homedir(), 'Downloads', 'ChatGPT_MCP_Images'),
		
		// Cleanup settings
		cleanupAfterDownload: false, // Don't auto-cleanup by default
		maxFileAge: 24, // hours
		maxDirectorySize: 100, // MB
		keepLastN: 10, // files
		
		// Download settings
		defaultFormat: 'png',
		retryAttempts: 3,
		retryDelay: 1000, // ms
		
		// Generation settings
		defaultStyle: 'realistic',
		defaultSize: '1024x1024'
	},
	
	applescript: {
		// AppleScript execution settings
		defaultTimeout: 30000, // 30 seconds
		retryAttempts: 3,
		retryDelay: 1000, // ms
		
		// UI interaction delays
		baseDelay: 500, // ms
		clickDelay: 300, // ms
		typeDelay: 100, // ms
		
		// M4 Mac specific optimizations
		m4Multiplier: 1.5 // Increase delays by 50% on M4
	},
	
	logging: {
		level: 'info', // debug, info, warn, error
		verbose: false
	},
	
	// Async generation settings
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

module.exports = { CONFIG };