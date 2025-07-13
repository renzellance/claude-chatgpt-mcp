/**
 * Async Image Generation Service - CommonJS Version
 * Handles async image generation with ChatGPT UI polling
 * RETAINS ALL ASYNC FUNCTIONALITY: start_image_generation, check_generation_status, get_latest_image
 */

const { runAppleScript } = require('../utils/applescript.js');
const { CONFIG } = require('../core/config.js');
const { v4: uuidv4 } = require('uuid');

class AsyncGenerationTracker {
	constructor() {
		this.activeGenerations = new Map();
		this.completedGenerations = new Map();
	}
	
	getStatus(id) {
		// Check completed first
		const completed = this.completedGenerations.get(id);
		if (completed) return completed;
		
		// Check active
		const active = this.activeGenerations.get(id);
		if (active) {
			return {
				id: active.id,
				status: 'generating',
				prompt: active.prompt,
				timestamp: active.started_at
			};
		}
		
		return null;
	}
	
	cleanup() {
		// Clean up old completed generations (older than 1 hour)
		const oneHourAgo = Date.now() - (60 * 60 * 1000);
		for (const [id, status] of this.completedGenerations.entries()) {
			if (status.timestamp < oneHourAgo) {
				this.completedGenerations.delete(id);
			}
		}
	}
}

// Global tracker instance
const tracker = new AsyncGenerationTracker();

/**
 * Start async image generation
 */
async function startImageGeneration(prompt, style, size, conversation_id) {
	const id = uuidv4();
	
	// Store generation info
	const generation = {
		id,
		prompt,
		style,
		size,
		conversation_id,
		started_at: Date.now()
	};
	
	tracker.activeGenerations.set(id, generation);
	
	// Start generation in background (fire and forget)
	triggerImageGeneration(prompt, style, size, conversation_id, id)
		.catch(error => {
			// Mark as failed
			tracker.completedGenerations.set(id, {
				id,
				status: 'failed',
				prompt,
				timestamp: Date.now(),
				error: error.message
			});
			tracker.activeGenerations.delete(id);
		});
	
	return id;
}

/**
 * Check generation status
 */
async function checkGenerationStatus(id) {
	const status = tracker.getStatus(id);
	if (!status) return null;
	
	// If still generating, poll ChatGPT UI for status
	if (status.status === 'generating') {
		const uiStatus = await pollChatGPTUI();
		
		// Check if generation completed
		if (uiStatus.isGenerating === false && uiStatus.hasRecentImage) {
			// Move to completed
			tracker.completedGenerations.set(id, {
				id,
				status: 'completed',
				prompt: status.prompt,
				timestamp: Date.now()
			});
			tracker.activeGenerations.delete(id);
			
			return tracker.completedGenerations.get(id);
		}
	}
	
	return status;
}

/**
 * Get the latest generated image
 */
async function getLatestImage(downloadPath) {
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
									click menu item "Copy image" of menu 1
									return "Image copied to clipboard"
								end try
							end try
						end try
						
						delay 1
						return "Image download initiated"
					else
						return "No images found in conversation"
					end if
				end tell
			end tell
		end tell
	`;
	
	const result = await runAppleScript(script);
	if (!result.success) {
		throw new Error(`Failed to get latest image: ${result.error}`);
	}
	
	return result.data || "Image retrieval completed";
}

/**
 * Internal function to trigger image generation
 */
async function triggerImageGeneration(prompt, style, size, conversation_id, generationId) {
	let fullPrompt = prompt;
	
	// Add style and size parameters to prompt if specified
	if (style) {
		fullPrompt += `, ${style} style`;
	}
	if (size) {
		fullPrompt += `, ${size}`;
	}
	
	const script = `
		tell application "ChatGPT"
			activate
			delay 1
			
			tell application "System Events"
				tell process "ChatGPT"
					${conversation_id ? `
					-- Navigate to specific conversation if provided
					try
						-- Implementation for conversation navigation would go here
						delay 0.5
					end try
					` : ''}
					
					-- Find the input text area
					set inputField to text area 1 of scroll area 1 of group 1 of group 1 of window 1
					
					-- Clear any existing text and type the prompt
					set focused of inputField to true
					key code 0 using {command down} -- Cmd+A to select all
					delay 0.1
					keystroke "${fullPrompt.replace(/"/g, '\\"')}"
					delay 0.5
					
					-- Press Enter to send
					key code 36 -- Enter key
					delay 1
				end tell
			end tell
		end tell
	`;
	
	const result = await runAppleScript(script);
	if (!result.success) {
		throw new Error(`Failed to trigger image generation: ${result.error}`);
	}
}

/**
 * Poll ChatGPT UI to check generation status
 */
async function pollChatGPTUI() {
	const script = `
		tell application "ChatGPT"
			activate
			delay 0.5
			
			tell application "System Events"
				tell process "ChatGPT"
					-- Check for generating indicators
					set isGenerating to false
					set hasImages to false
					
					-- Look for "Generating..." or similar indicators
					try
						set generatingElements to (every static text of window 1 whose value contains "generating" or value contains "Generating")
						if (count of generatingElements) > 0 then
							set isGenerating to true
						end if
					end try
					
					-- Check for recent images
					try
						set imageElements to (every image of window 1)
						if (count of imageElements) > 0 then
							set hasImages to true
						end if
					end try
					
					return {isGenerating:isGenerating, hasImages:hasImages}
				end tell
			end tell
		end tell
	`;
	
	const result = await runAppleScript(script);
	if (!result.success) {
		return {isGenerating: false, hasRecentImage: false};
	}
	
	// Parse the result
	const data = result.data || "{isGenerating:false, hasImages:false}";
	const parsed = {
		isGenerating: data.includes("isGenerating:true"),
		hasRecentImage: data.includes("hasImages:true")
	};
	
	return parsed;
}

/**
 * Cleanup old generations
 */
function cleanupGenerations() {
	tracker.cleanup();
}

/**
 * Get tracker for testing/debugging
 */
function getTracker() {
	return tracker;
}

module.exports = {
	startImageGeneration,
	checkGenerationStatus,
	getLatestImage,
	cleanupGenerations,
	getTracker
};
