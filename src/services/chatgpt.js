/**
 * ChatGPT Service - CommonJS Version
 */

const { runAppleScript } = require('../utils/applescript.js');
const { CONFIG } = require('../core/config.js');

/**
 * Ask ChatGPT a question
 */
async function askChatGPT(prompt, conversationId) {
	let script = `
		tell application "ChatGPT"
			activate
			delay 1
			
			tell application "System Events"
				tell process "ChatGPT"
					-- Find the input text area
					set inputField to text area 1 of scroll area 1 of group 1 of group 1 of window 1
					
					-- Clear any existing text and type the prompt
					set focused of inputField to true
					key code 0 using {command down} -- Cmd+A to select all
					delay 0.1
					keystroke "${prompt.replace(/"/g, '\\"')}"
					delay 0.5
					
					-- Press Enter to send
					key code 36 -- Enter key
					delay 2
					
					-- Wait for response (simplified)
					delay 5
					
					-- Try to get the response text
					try
						set responseElements to (every static text of window 1)
						if (count of responseElements) > 0 then
							set lastResponse to value of item -1 of responseElements
							return lastResponse
						else
							return "Response received but could not extract text"
						end if
					on error
						return "Response received but could not extract text"
					end try
				end tell
			end tell
		end tell
	`;
	
	const result = await runAppleScript(script);
	if (!result.success) {
		throw new Error(`Failed to ask ChatGPT: ${result.error}`);
	}
	
	return result.data || "No response received";
}

/**
 * Get list of conversations
 */
async function getConversations() {
	const script = `
		tell application "ChatGPT"
			activate
			delay 1
			
			tell application "System Events"
				tell process "ChatGPT"
					try
						-- Try to find conversation list elements
						set conversationElements to (every button of window 1 whose description contains "conversation" or title contains "conversation")
						set conversationList to {}
						
						repeat with conv in conversationElements
							try
								set conversationTitle to title of conv
								if conversationTitle is not "" then
									set end of conversationList to conversationTitle
								end if
							end try
						end repeat
						
						return conversationList
					on error
						return {"Could not access conversation list"}
					end try
				end tell
			end tell
		end tell
	`;
	
	const result = await runAppleScript(script);
	if (!result.success) {
		throw new Error(`Failed to get conversations: ${result.error}`);
	}
	
	// Parse the result if it's an array-like string
	const data = result.data || "[]";
	if (Array.isArray(data)) {
		return data;
	}
	
	// Try to parse as array
	try {
		const parsed = JSON.parse(data);
		return Array.isArray(parsed) ? parsed : [data];
	} catch {
		return [data];
	}
}

module.exports = {
	askChatGPT,
	getConversations
};