/**
 * Image Download Service
 * Handles downloading images from ChatGPT using the sync method
 */

import { ImageDownloadResult } from '../core/types.js';
import { runAppleScript } from '../utils/applescript.js';
import { CONFIG } from '../core/config.js';
import { askChatGPT } from './chatgpt.js';
import { downloadImageFromChatGPT, ensureDownloadDirectory } from '../utils/file-system.js';

/**
 * Process image generation with download support (legacy sync method)
 */
export async function processImageGeneration(
	prompt: string,
	style?: string,
	size?: string,
	conversationId?: string,
	downloadImage: boolean = true,
	savePath?: string
): Promise<ImageDownloadResult> {
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
	
	let imagePath: string | undefined;
	let cleanupFunction: (() => Promise<void>) | undefined;

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
						const fs = await import('fs/promises');
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
export async function downloadLatestImage(savePath?: string): Promise<{ success: boolean; imagePath?: string; error?: string }> {
	try {
		return await downloadImageFromChatGPT(savePath);
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}