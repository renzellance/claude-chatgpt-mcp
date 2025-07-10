# Claude ChatGPT MCP Tool with Image Generation

This is a Model Context Protocol (MCP) tool that allows Claude to interact with the ChatGPT desktop app on macOS, including DALL-E image generation capabilities.

## Features

- Ask ChatGPT questions directly from Claude
- **Generate images using DALL-E through ChatGPT Plus**
- View ChatGPT conversation history
- Continue existing ChatGPT conversations
- **Enhanced M4 Mac compatibility**

## Prerequisites

- macOS with Apple Silicon chip (M1/M2/M3/**M4** supported)
- [ChatGPT desktop app](https://chatgpt.com/download) installed
- **ChatGPT Plus subscription** (required for DALL-E image generation)
- [Bun](https://bun.sh/) installed
- [Claude desktop app](https://claude.ai/desktop) installed

## Installation

### NPX Installation (Recommended)

You can use NPX to run this tool without cloning the repository:

1. **Install and run the package using NPX:**

```bash
npx claude-chatgpt-mcp
```

2. **Configure Claude Desktop:**

Edit your `claude_desktop_config.json` file (located at `~/Library/Application Support/Claude/claude_desktop_config.json`) to include this tool:

```json
{
  "mcpServers": {
    "chatgpt-mcp": {
      "command": "npx",
      "args": ["claude-chatgpt-mcp"]
    }
  }
}
```

3. **Restart the Claude Desktop app**

4. **Grant necessary permissions:**
   - Go to System Preferences > Privacy & Security > Privacy
   - Give Terminal (or iTerm) access to Accessibility features
   - You may see permission prompts when the tool is first used

### Manual Installation

1. Clone this repository:

```bash
git clone https://github.com/renzellance/claude-chatgpt-mcp.git
cd claude-chatgpt-mcp
```

2. Install dependencies:

```bash
bun install
```

3. Build the project:

```bash
bun run build
```

4. Update your Claude Desktop configuration:

Edit your `claude_desktop_config.json` file (located at `~/Library/Application Support/Claude/claude_desktop_config.json`) to include this tool:

```json
{
  "mcpServers": {
    "chatgpt-mcp": {
      "command": "/Users/YOURUSERNAME/.bun/bin/bun",
      "args": ["run", "/path/to/claude-chatgpt-mcp/index.ts"]
    }
  }
}
```

Make sure to replace `YOURUSERNAME` with your actual macOS username and adjust the path to where you cloned this repository.

5. Restart Claude Desktop app

6. Grant permissions:
   - Go to System Preferences > Privacy & Security > Privacy
   - Give Terminal (or iTerm) access to Accessibility features
   - You may see permission prompts when the tool is first used

## Usage

Once installed, you can use the ChatGPT tool directly from Claude by asking questions like:

### Text Generation
- "Can you ask ChatGPT what the capital of France is?"
- "Show me my recent ChatGPT conversations"
- "Ask ChatGPT to explain quantum computing"

### Image Generation (NEW!)
- "Generate an image of a peaceful meditation scene in cartoon style"
- "Create a sticker design of a cute plant with 'Stay Planted' text"
- "Generate a realistic landscape image at 1792x1024 size"

### Advanced Usage Examples

#### Text Operations
```javascript
// Basic question
{
  "operation": "ask",
  "prompt": "What are the best practices for sustainable gardening?"
}

// Continue specific conversation
{
  "operation": "ask",
  "prompt": "Can you elaborate on composting techniques?",
  "conversation_id": "your-conversation-id"
}
```

#### Image Generation Operations
```javascript
// Basic image generation
{
  "operation": "generate_image",
  "prompt": "A minimalist botanical illustration of sage plants"
}

// Styled image generation
{
  "operation": "generate_image",
  "prompt": "Mindfulness meditation scene",
  "image_style": "watercolor",
  "image_size": "1024x1024"
}

// Generate in specific conversation
{
  "operation": "generate_image",
  "prompt": "Logo design for wellness brand",
  "image_style": "minimalist",
  "conversation_id": "your-conversation-id"
}
```

## M4 Mac Compatibility

This version includes specific enhancements for M4 Mac compatibility:

- **Increased wait times** for better stability on M4 processors
- **Enhanced error handling** for accessibility features
- **Improved UI element detection** that works across different Mac architectures
- **More robust AppleScript execution** with better fallback mechanisms

If you're using an M4 Mac and experiencing issues, please:
1. Ensure ChatGPT desktop app is fully updated
2. Grant all required accessibility permissions
3. Try restarting both Claude Desktop and ChatGPT apps
4. Check the console output for detailed error messages

## Troubleshooting

### General Issues
1. Make sure ChatGPT app is installed and you're logged in
2. Verify you have ChatGPT Plus subscription for image generation
3. Check that you've granted all necessary accessibility permissions
4. Try restarting both Claude and ChatGPT apps

### M4 Specific Issues
If you're experiencing issues on M4 Macs:
1. **Increase delays**: The tool automatically uses longer wait times on all Apple Silicon Macs
2. **Check Rosetta**: Ensure you're not running the ChatGPT app under Rosetta translation
3. **Update macOS**: Make sure you're running the latest macOS version compatible with M4
4. **Accessibility permissions**: M4 Macs may require additional permission confirmations

### Image Generation Issues
1. **ChatGPT Plus required**: Image generation only works with ChatGPT Plus subscription
2. **Longer wait times**: Image generation can take 30 seconds to 5 minutes
3. **Network connection**: Ensure stable internet connection for DALL-E requests
4. **Prompt clarity**: Use clear, descriptive prompts for better results

### Permission Issues
If the tool can't control ChatGPT:
1. Go to System Preferences > Privacy & Security > Privacy > Accessibility
2. Remove and re-add Terminal (or your terminal app)
3. Restart Claude Desktop
4. Try the tool again

## Technical Details

### Enhanced AppleScript Robustness

#### Conversation Retrieval
- Added multiple UI element targeting approaches to handle ChatGPT UI changes
- Implemented better error detection with specific error messages
- Added fallback mechanisms using accessibility attributes
- Improved timeout handling with appropriate delays

#### Response Handling
- Replaced fixed waiting times with dynamic response detection
- Added intelligent completion detection that recognizes when ChatGPT has finished typing
- Implemented text stability detection (waits until text stops changing)
- Added response extraction logic to isolate just the relevant response text
- Improved error handling with detailed error messages
- Added post-processing to clean up UI elements from responses
- Implemented incomplete response detection to warn about potential cutoffs

#### Image Generation Features
- **DALL-E Integration**: Direct integration with ChatGPT Plus DALL-E capabilities
- **Style Control**: Support for different artistic styles (realistic, cartoon, abstract, etc.)
- **Size Options**: Support for various image dimensions (1024x1024, 1792x1024, 1024x1792)
- **Extended Timeouts**: Longer wait times specifically for image generation processes
- **Conversation Context**: Generate images within existing ChatGPT conversations

### M4 Architecture Optimizations
- **Enhanced Timing**: Adjusted wait intervals and timeouts for M4 processor speeds
- **Improved Error Handling**: Better graceful degradation when UI elements are inaccessible
- **Robust Element Detection**: Multiple fallback methods for finding UI elements
- **Memory Management**: Optimized for M4's unified memory architecture

These optimizations make the integration more reliable across different scenarios, more resilient to UI changes in the ChatGPT application, and better at handling longer response times without message cutoff issues on all Apple Silicon Macs, including the latest M4 architecture.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT