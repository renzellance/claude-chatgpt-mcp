# Enhanced ChatGPT MCP Tool with Async Image Generation

A comprehensive Model Context Protocol (MCP) tool that enables Claude to interact seamlessly with the ChatGPT desktop app on macOS, featuring robust DALL-E image generation with actual file download capabilities and async batch processing.

## 🚀 What's New in Version 2.1

- **🔄 Async Image Generation**: Start generation, check status, retrieve when ready
- **⚡ Batch Processing**: Generate multiple images without blocking
- **🎯 Actual Image Downloads**: Downloads real image files (not just text descriptions)
- **🏗️ TypeScript Build System**: Proper compilation and development workflow
- **🔧 Enhanced Dependencies**: Fixed missing UUID support for generation tracking
- **📁 Organized Architecture**: Clean TypeScript source with proper build output

## ✨ Features

### Core Functionality
- **Text Conversations**: Ask ChatGPT questions directly from Claude
- **Sync Image Generation**: Traditional generate and wait approach
- **Async Image Generation**: Non-blocking image generation with status polling
- **File Downloads**: Actually download generated images to your file system
- **Conversation Management**: View and continue existing ChatGPT conversations
- **Enhanced M4 Mac Support**: Optimized for all Apple Silicon chips

### Async Operations
- **`start_image_generation`**: Begin image generation and get tracking ID
- **`check_generation_status`**: Poll generation progress
- **`get_latest_image`**: Retrieve completed images

### Advanced Capabilities
- **Multiple Download Methods**: Tries various approaches to ensure successful downloads
- **Smart Retry Logic**: Exponential backoff with configurable retry attempts
- **Error Recovery**: Detailed error messages with solution steps
- **Resource Management**: Automatic cleanup and directory size management
- **File Verification**: Ensures complete downloads before reporting success
- **Generation Tracking**: Track multiple concurrent image generations

## 📋 Prerequisites

- **macOS** with Apple Silicon chip (M1/M2/M3/M4 supported)
- **[ChatGPT desktop app](https://chatgpt.com/download)** installed
- **ChatGPT Plus subscription** (required for DALL-E image generation)
- **Node.js 18+** installed
- **[Claude desktop app](https://claude.ai/desktop)** installed

## 🚀 Installation

### Quick Start (NPM)

```bash
npm install -g claude-chatgpt-mcp
```

### Development Installation

1. **Clone this repository:**

```bash
git clone https://github.com/renzellance/claude-chatgpt-mcp.git
cd claude-chatgpt-mcp
```

2. **Install dependencies:**

```bash
npm install
```

3. **Build the project:**

```bash
npm run build
```

4. **Configure Claude Desktop:**

Edit your `claude_desktop_config.json` file (located at `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "chatgpt-mcp": {
      "command": "node",
      "args": ["/path/to/claude-chatgpt-mcp/dist/index.js"]
    }
  }
}
```

5. **Restart Claude Desktop app**

6. **Grant permissions:**
   - Go to System Preferences > Privacy & Security > Privacy
   - Give Terminal (or iTerm) access to Accessibility features

## 💡 Usage Examples

### Text Generation
```
"Can you ask ChatGPT what the capital of France is?"
"Show me my recent ChatGPT conversations"
"Ask ChatGPT to explain quantum computing"
```

### Sync Image Generation
```
"Generate an image of a peaceful meditation scene in cartoon style"
"Create a logo design for a tech startup with modern aesthetics"
"Generate a realistic landscape image at 1792x1024 size"
```

### Async Image Generation (New!)
```
"Start generating an image of a mountain landscape"
→ Returns: Generation ID abc-123

"Check status of generation abc-123"
→ Returns: Status (pending/generating/completed/failed)

"Get the latest generated image"
→ Downloads the completed image
```

## 🔧 Development Workflow

### Building and Testing

```bash
# Development mode (TypeScript compilation + watch)
npm run dev

# Production build
npm run build

# Clean build artifacts
npm run clean

# Start built version
npm start
```

### Project Structure

```
src/
├── core/              # Core types, config, and server setup
├── services/          # Business logic (ChatGPT, async generation)
├── utils/             # Utilities (retry, errors, file system)
├── handlers/          # MCP request handlers
└── index.ts           # Main entry point

dist/                  # Compiled JavaScript output
```

### Advanced Configuration

#### Image Generation Options

```javascript
{
  "operation": "start_image_generation",  // or "generate_image" for sync
  "prompt": "A serene mountain landscape",
  "image_style": "realistic",             // Style: realistic, cartoon, abstract, etc.
  "image_size": "1024x1024",              // Size: 1024x1024, 1792x1024, 1024x1792
  "conversation_id": "optional-id"        // Continue specific conversation
}

// Check status later
{
  "operation": "check_generation_status",
  "generation_id": "returned-uuid"
}

// Retrieve when ready
{
  "operation": "get_latest_image",
  "save_path": "/custom/path"             // Optional custom save location
}
```

### File Management

- **Default Location**: `~/Downloads/ChatGPT_MCP_Images/`
- **Naming Convention**: `chatgpt_TIMESTAMP_PROMPT_STYLE.png`
- **Auto-Cleanup**: Configurable cleanup based on age, size, and count
- **Generation Tracking**: In-memory tracking with automatic cleanup

## 🐛 Troubleshooting

### Build Issues

```bash
# Missing dependencies
npm install

# TypeScript compilation errors
npm run clean && npm run build

# Module resolution issues
rm -rf node_modules dist && npm install && npm run build
```

### Runtime Issues

#### Permission Problems
```
Error: Cannot access ChatGPT interface
```
**Solution:**
1. Open System Preferences > Privacy & Security > Accessibility
2. Add Terminal (or iTerm) to the list
3. Enable the checkbox
4. Restart Claude Desktop

#### App Not Running
```
Error: ChatGPT application is not running
```
**Solution:**
1. Start the ChatGPT desktop app
2. Ensure you're logged in
3. Wait for full app loading

#### Async Generation Issues
```
Error: Generation ID not found
```
**Solution:**
1. Check that you're using the correct generation ID
2. Generations expire after 1 hour
3. Use `get_latest_image` if status shows completed

#### M4 Mac Specific
- Ensure ChatGPT app is running natively (not under Rosetta)
- Update to latest macOS version
- Try restarting both apps if issues persist

## 🔒 Security & Privacy

- **Minimal Permissions**: Uses only necessary AppleScript commands
- **No Data Collection**: All operations are local to your machine
- **File Cleanup**: Optional automatic cleanup of downloaded files
- **Generation Tracking**: In-memory only, no persistent storage
- **Error Handling**: No sensitive information in error messages

## 🚀 Performance Optimizations

- **Async Processing**: Non-blocking image generation
- **Smart Caching**: Reduces redundant operations
- **Efficient Retries**: Exponential backoff prevents system overload
- **Resource Management**: Automatic cleanup prevents disk space issues
- **Background Operations**: Non-blocking cleanup and maintenance

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
git clone https://github.com/renzellance/claude-chatgpt-mcp.git
cd claude-chatgpt-mcp
npm install
npm run dev
```

### Code Standards

- TypeScript strict mode
- Modular architecture
- Comprehensive error handling
- Documentation for all public functions
- Proper build and compilation process

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- Inspired by the need for robust ChatGPT integration
- Thanks to the Claude and ChatGPT communities

---

**Note**: This tool requires macOS and is designed specifically for the ChatGPT desktop application. Windows and Linux support may be added in future versions.