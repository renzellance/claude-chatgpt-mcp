/**
 * Configuration constants for the ChatGPT MCP Tool
 */

import * as path from 'path';
import * as os from 'os';
import { CleanupOptions, ImageFormat, UISelector } from './types.js';

export const CONFIG = {
	retry: {
		maxRetries: 3,
		baseDelay: 1000,
		maxDelay: 10000,
		backoffFactor: 2,
	},
	image: {
		downloadPath: path.join(os.homedir(), 'Downloads', 'ChatGPT_MCP_Images'),
		maxDownloadWaitTime: 30000,
		maxFileCheckAttempts: 30,
		cleanupAfterDownload: true,
	},
	applescript: {
		maxWaitTime: 180,
		imageWaitTime: 300,
		waitInterval: 1,
		requiredStableChecks: 4,
		activationDelay: 2,
		clipboardDelay: 0.5,
	},
	logging: {
		level: 'info' as 'debug' | 'info' | 'warn' | 'error',
		verbose: false,
	}
};

export const SUPPORTED_FORMATS: Record<string, ImageFormat> = {
	png: { extension: '.png', mimeType: 'image/png' },
	// Future: jpg, webp, etc.
};

export const UI_SELECTORS: Record<string, UISelector[]> = {
	saveImage: [
		{ type: 'menuitem', identifier: 'Save Image', fallbacks: ['Download', 'Save'] },
		{ type: 'button', identifier: 'Save', fallbacks: ['Download'] },
	],
	images: [
		{ type: 'image', identifier: 'AXImage' },
	]
};

export const DEFAULT_CLEANUP_OPTIONS: CleanupOptions = {
	deleteAfterProcessing: true,
	maxFileAge: 24, // 24 hours
	maxDirectorySize: 500, // 500 MB
	keepLastN: 10, // Keep last 10 files
};

export const ERROR_MESSAGES = {
	ACCESSIBILITY_DENIED: "Cannot access ChatGPT interface. Please ensure Accessibility permissions are granted to Terminal/iTerm in System Preferences > Privacy & Security > Accessibility.",
	APP_NOT_RUNNING: "ChatGPT application is not running. Please start it manually.",
	NO_WINDOW: "ChatGPT is running but no window is available. Please ensure ChatGPT is fully loaded.",
	NO_IMAGES_FOUND: "No images found in the current ChatGPT conversation. Make sure an image has been generated.",
	DOWNLOAD_TIMEOUT: "Image download timed out. The image may have been saved with a different name or location.",
	DIRECTORY_CREATE_FAILED: "Cannot create download directory. Check permissions.",
};
