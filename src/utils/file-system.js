/**
 * File system utilities - CommonJS Version
 */

const fs = require('fs/promises');
const path = require('path');
const { CONFIG } = require('../core/config');
const { runAppleScript } = require('./applescript');

/**
 * Ensure the download directory exists
 */
function ensureDownloadDirectory() {
	try {
		const fsSync = require('fs');
		if (!fsSync.existsSync(CONFIG.image.downloadPath)) {
			fsSync.mkdirSync(CONFIG.image.downloadPath, { recursive: true });
		}
	} catch (error) {
		console.warn(`Failed to create download directory: ${error}`);
	}
}

/**
 * Download image from ChatGPT UI
 */
async function downloadImageFromChatGPT(savePath) {
	const timestamp = Date.now();
	const filename = `chatgpt_image_${timestamp}.png`;
	const targetPath = savePath || path.join(CONFIG.image.downloadPath, filename);
	
	const script = `
		tell application "ChatGPT"
			activate
			delay 0.5
			
			tell application "System Events"
				tell process "ChatGPT"
					-- Look for the most recent image in the conversation
					set imageElements to (every image of window 1)
					if (count of imageElements) > 0 then
						-- Get the last (most recent) image
						set lastImage to item -1 of imageElements
						
						-- Right-click to open context menu
						perform action "AXShowMenu" of lastImage
						delay 0.3
						
						-- Look for download/save option
						try
							click menu item "Save image" of menu 1
						on error
							try
								click menu item "Download image" of menu 1
							on error
								try
									click menu item "Save Image As..." of menu 1
								on error
									return "No save option found"
								end try
							end try
						end try
						
						delay 1
						
						-- Handle save dialog if it appears
						try
							-- Type the target path
							keystroke "${targetPath.replace(/"/g, '\\"')}"
							delay 0.5
							
							-- Press Enter to save
							key code 36 -- Enter key
							delay 1
							
							return "Image saved to ${targetPath.replace(/"/g, '\\"')}"
						on error
							return "Save dialog handling failed"
						end try
					else
						return "No images found in conversation"
					end if
				end tell
			end tell
		end tell
	`;
	
	try {
		const result = await runAppleScript(script);
		
		if (result.success && result.data && result.data.includes('Image saved')) {
			// Verify the file actually exists
			try {
				await fs.access(targetPath);
				return {
					success: true,
					imagePath: targetPath
				};
			} catch {
				return {
					success: false,
					error: "File was not saved successfully"
				};
			}
		}
		
		return {
			success: false,
			error: result.error || result.data || "Unknown error"
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

/**
 * Clean up old files in the download directory
 */
async function cleanupFiles(directory, maxAgeHours = 24) {
	try {
		const files = await fs.readdir(directory);
		const now = Date.now();
		const maxAge = maxAgeHours * 60 * 60 * 1000;
		
		for (const file of files) {
			const filePath = path.join(directory, file);
			try {
				const stats = await fs.stat(filePath);
				if (now - stats.mtime.getTime() > maxAge) {
					await fs.unlink(filePath);
					console.log(`Cleaned up old file: ${filePath}`);
				}
			} catch (error) {
				console.warn(`Failed to cleanup file ${filePath}: ${error}`);
			}
		}
	} catch (error) {
		console.warn(`Cleanup failed: ${error}`);
	}
}

/**
 * Get file size in MB
 */
async function getFileSize(filePath) {
	try {
		const stats = await fs.stat(filePath);
		return stats.size / (1024 * 1024);
	} catch {
		return 0;
	}
}

/**
 * Check if directory size exceeds limit and clean if needed
 */
async function checkDirectorySize(directory, maxSizeMB = 100) {
	try {
		const files = await fs.readdir(directory);
		let totalSize = 0;
		
		const fileStats = await Promise.all(
			files.map(async (file) => {
				const filePath = path.join(directory, file);
				const stats = await fs.stat(filePath);
				totalSize += stats.size;
				return { path: filePath, mtime: stats.mtime, size: stats.size };
			})
		);
		
		const totalSizeMB = totalSize / (1024 * 1024);
		
		if (totalSizeMB > maxSizeMB) {
			// Sort by modification time (oldest first)
			fileStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
			
			// Delete oldest files until under limit
			let currentSize = totalSizeMB;
			for (const file of fileStats) {
				if (currentSize <= maxSizeMB) break;
				
				try {
					await fs.unlink(file.path);
					currentSize -= file.size / (1024 * 1024);
					console.log(`Removed file to free space: ${file.path}`);
				} catch (error) {
					console.warn(`Failed to remove file ${file.path}: ${error}`);
				}
			}
		}
	} catch (error) {
		console.warn(`Directory size check failed: ${error}`);
	}
}

/**
 * Create a unique filename with timestamp
 */
function createUniqueFilename(baseName, extension) {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	return `${baseName}_${timestamp}_${random}.${extension}`;
}

module.exports = {
	ensureDownloadDirectory,
	downloadImageFromChatGPT,
	cleanupFiles,
	getFileSize,
	checkDirectorySize,
	createUniqueFilename
};