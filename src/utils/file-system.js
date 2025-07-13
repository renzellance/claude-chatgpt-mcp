/**
 * File system utilities - CommonJS Version WITH SECURITY HARDENING
 */

const fs = require('fs/promises');
const path = require('path');
const { CONFIG } = require('../core/config');
const { runAppleScript, sanitizePromptForAppleScript } = require('./applescript');

/**
 * SECURITY: Validate file paths to prevent directory traversal
 */
function validateSavePath(userPath) {
	if (!userPath || typeof userPath !== 'string') {
		return path.join(CONFIG.image.downloadPath, 'default.png');
	}
	
	// Resolve to absolute path
	const resolvedPath = path.resolve(userPath);
	const allowedDir = path.resolve(CONFIG.image.downloadPath);
	
	// SECURITY: Ensure path is within allowed directory
	if (!resolvedPath.startsWith(allowedDir)) {
		throw new Error(`Security violation: Path '${userPath}' is outside allowed directory`);
	}
	
	// SECURITY: Check for suspicious file names
	const fileName = path.basename(resolvedPath);
	if (fileName.includes('..') || fileName.includes('~') || fileName.startsWith('.')) {
		throw new Error(`Security violation: Invalid filename '${fileName}'`);
	}
	
	// SECURITY: Limit file extension to safe types
	const ext = path.extname(fileName).toLowerCase();
	const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
	if (ext && !allowedExtensions.includes(ext)) {
		throw new Error(`Security violation: File extension '${ext}' not allowed`);
	}
	
	return resolvedPath;
}

/**
 * SECURITY: Validate file size to prevent disk exhaustion
 */
async function validateFileSize(filePath, maxSizeMB = 50) {
	try {
		const stats = await fs.stat(filePath);
		const sizeMB = stats.size / (1024 * 1024);
		
		if (sizeMB > maxSizeMB) {
			throw new Error(`File too large: ${sizeMB.toFixed(1)}MB (max: ${maxSizeMB}MB)`);
		}
		
		return true;
	} catch (error) {
		if (error.code === 'ENOENT') {
			return true; // File doesn't exist yet, that's fine
		}
		throw error;
	}
}

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
 * Download image from ChatGPT UI WITH SECURITY
 */
async function downloadImageFromChatGPT(savePath) {
	const timestamp = Date.now();
	const filename = `chatgpt_image_${timestamp}.png`;
	
	// SECURITY: Validate and sanitize the save path
	const safePath = savePath ? validateSavePath(savePath) : path.join(CONFIG.image.downloadPath, filename);
	
	// SECURITY: Sanitize path for AppleScript
	const sanitizedPath = sanitizePromptForAppleScript(safePath);
	
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
							keystroke "${sanitizedPath}"
							delay 0.5
							
							-- Press Enter to save
							key code 36 -- Enter key
							delay 1
							
							return "Image saved to ${sanitizedPath}"
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
			// SECURITY: Verify the file actually exists and validate size
			try {
				await fs.access(safePath);
				await validateFileSize(safePath);
				
				return {
					success: true,
					imagePath: safePath
				};
			} catch (error) {
				return {
					success: false,
					error: `File validation failed: ${error.message}`
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
 * Clean up old files in the download directory WITH SECURITY
 */
async function cleanupFiles(directory, maxAgeHours = 24) {
	// SECURITY: Validate directory is within allowed bounds
	const safeDir = path.resolve(directory);
	const allowedDir = path.resolve(CONFIG.image.downloadPath);
	
	if (!safeDir.startsWith(allowedDir)) {
		console.warn(`Security: Cleanup attempted outside allowed directory: ${directory}`);
		return;
	}
	
	try {
		const files = await fs.readdir(safeDir);
		const now = Date.now();
		const maxAge = maxAgeHours * 60 * 60 * 1000;
		
		let cleanedCount = 0;
		const maxCleanup = 100; // SECURITY: Limit cleanup operations
		
		for (const file of files.slice(0, maxCleanup)) {
			const filePath = path.join(safeDir, file);
			
			// SECURITY: Skip hidden files and directories
			if (file.startsWith('.') || file.includes('..')) {
				continue;
			}
			
			try {
				const stats = await fs.stat(filePath);
				
				// Only delete files, not directories
				if (stats.isFile() && now - stats.mtime.getTime() > maxAge) {
					await fs.unlink(filePath);
					cleanedCount++;
					console.log(`🗑️ Cleaned up: ${path.basename(filePath)}`);
				}
			} catch (error) {
				console.warn(`Failed to cleanup file ${filePath}: ${error.message}`);
			}
		}
		
		if (cleanedCount > 0) {
			console.log(`✅ Cleanup complete: ${cleanedCount} files removed`);
		}
	} catch (error) {
		console.warn(`Cleanup failed: ${error.message}`);
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
 * Check if directory size exceeds limit and clean if needed WITH SECURITY
 */
async function checkDirectorySize(directory, maxSizeMB = 100) {
	// SECURITY: Validate directory
	const safeDir = path.resolve(directory);
	const allowedDir = path.resolve(CONFIG.image.downloadPath);
	
	if (!safeDir.startsWith(allowedDir)) {
		console.warn(`Security: Directory size check outside allowed directory: ${directory}`);
		return;
	}
	
	try {
		const files = await fs.readdir(safeDir);
		let totalSize = 0;
		
		const fileStats = await Promise.all(
			files.slice(0, 1000).map(async (file) => { // SECURITY: Limit file processing
				if (file.startsWith('.')) return null; // Skip hidden files
				
				const filePath = path.join(safeDir, file);
				try {
					const stats = await fs.stat(filePath);
					if (stats.isFile()) {
						totalSize += stats.size;
						return { path: filePath, mtime: stats.mtime, size: stats.size };
					}
				} catch {
					return null;
				}
				return null;
			})
		);
		
		const validFiles = fileStats.filter(Boolean);
		const totalSizeMB = totalSize / (1024 * 1024);
		
		if (totalSizeMB > maxSizeMB) {
			console.log(`📊 Directory size: ${totalSizeMB.toFixed(1)}MB (limit: ${maxSizeMB}MB)`);
			
			// Sort by modification time (oldest first)
			validFiles.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
			
			// Delete oldest files until under limit
			let currentSize = totalSizeMB;
			let deletedCount = 0;
			const maxDeletions = 50; // SECURITY: Limit deletions
			
			for (const file of validFiles.slice(0, maxDeletions)) {
				if (currentSize <= maxSizeMB) break;
				
				try {
					await fs.unlink(file.path);
					currentSize -= file.size / (1024 * 1024);
					deletedCount++;
					console.log(`🗑️ Removed file to free space: ${path.basename(file.path)}`);
				} catch (error) {
					console.warn(`Failed to remove file ${file.path}: ${error.message}`);
				}
			}
			
			if (deletedCount > 0) {
				console.log(`✅ Size cleanup: ${deletedCount} files removed, now ${currentSize.toFixed(1)}MB`);
			}
		}
	} catch (error) {
		console.warn(`Directory size check failed: ${error.message}`);
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
	createUniqueFilename,
	validateSavePath,
	validateFileSize
};