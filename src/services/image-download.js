/**
 * Image Download Service - CommonJS Version
 */

const { runAppleScript } = require('../utils/applescript');
const { CONFIG } = require('../core/config');
const { askChatGPT } = require('./chatgpt');
const { downloadImageFromChatGPT, ensureDownloadDirectory } = require('../utils/file-system');

/**
 * Process image generation with download support (legacy sync method)
 */
async function processImageGeneration(
	prompt,
	style,
	size,
	conversationId,
	downloadImage = true,
	savePath
) {
	let fullPrompt = prompt;
	
	// Add style and size parameters to prompt if specified
	if (style) {
		fullPrompt += `, ${style} style`;
	}
	if (size) {
		fullPrompt += `, ${size}`;
	}

	// Generate image via ChatGPT
	const response = await askChatGPT(fullPrompt, conversationId);
	
	let imagePath;
	let cleanupFunction;

	if (downloadImage) {
		try {
			// Ensure download directory exists
			ensureDownloadDirectory();
			
			// Download the generated image
			const downloadResult = await downloadImageFromChatGPT(savePath);
			
			if (downloadResult.success && downloadResult.imagePath) {
				imagePath = downloadResult.imagePath;
				
				// Create cleanup function
				cleanupFunction = async () => {
					try {
						const fs = require('fs/promises');
						if (imagePath) {
							await fs.unlink(imagePath);
						}
					} catch (error) {
						console.warn(`Failed to cleanup image file: ${error}`);
					}
				};
			}
		} catch (error) {
			console.warn(`Image download failed: ${error}`);
			// Continue without failing the entire operation
		}
	}

	return {
		response: response || "Image generation completed",
		imagePath,
		cleanupFunction
	};
}

/**
 * Download latest image from ChatGPT (used by both sync and async workflows)
 */
async function downloadLatestImage(savePath) {
	try {
		return await downloadImageFromChatGPT(savePath);
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

module.exports = {
	processImageGeneration,
	downloadLatestImage
};