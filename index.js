#!/usr/bin/env node
/**
 * Enhanced ChatGPT MCP Tool - CommonJS Version
 * Retains ALL async functionality: start_image_generation, check_generation_status, get_latest_image
 */

const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { createServer } = require('./src/core/server');
const { CONFIG } = require('./src/core/config');
const { ensureDownloadDirectory, cleanupFiles } = require('./src/utils/file-system');

/**
 * Initialize the application
 */
async function initialize() {
	try {
		// Ensure download directory exists
		ensureDownloadDirectory();
		
		// Run initial cleanup if enabled
		if (CONFIG.image.cleanupAfterDownload) {
			await cleanupFiles(CONFIG.image.downloadPath);
		}
		
		console.error("Enhanced ChatGPT MCP Server initialized successfully");
	} catch (error) {
		console.error("Failed to initialize:", error);
		process.exit(1);
	}
}

/**
 * Main function
 */
async function main() {
	try {
		// Initialize
		await initialize();
		
		// Create and start server
		const server = createServer();
		const transport = new StdioServerTransport();
		
		await server.connect(transport);
		console.error("Enhanced ChatGPT MCP Server with async image generation running on stdio");
		
		// Graceful shutdown handling
		process.on('SIGINT', async () => {
			console.error('\nShutting down gracefully...');
			try {
				// Final cleanup
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
main().catch((error) => {
	console.error("Application failed to start:", error);
	process.exit(1);
});