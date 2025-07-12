#!/usr/bin/env node
/**
 * Main entry point for the Enhanced ChatGPT MCP Tool
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from './core/server.js';
import { CONFIG } from './core/config.js';
import { ensureDownloadDirectory, cleanupFiles } from './utils/file-system.js';

/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
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
async function main(): Promise<void> {
	try {
		// Initialize
		await initialize();
		
		// Create and start server
		const server = createServer();
		const transport = new StdioServerTransport();
		
		await server.connect(transport);
		console.error("Enhanced ChatGPT MCP Server with image download running on stdio");
		
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
