# Enhanced ChatGPT MCP Tool with Robust Image Download

A comprehensive Model Context Protocol (MCP) tool that enables Claude to interact seamlessly with the ChatGPT desktop app on macOS, featuring robust DALL-E image generation with actual file download capabilities.

## 🚀 What's New in Version 2.0

- **🎯 Actual Image Downloads**: Downloads real image files (not just text descriptions)
- **🔄 Multiple Download Strategies**: Context menu, keyboard shortcuts, and fallback methods
- **⚡ Enhanced Error Handling**: Smart retry logic with exponential backoff
- **🏗️ Modular Architecture**: Clean, maintainable code structure
- **🧹 Auto-Cleanup**: Configurable file cleanup and resource management
- **🛡️ Robust UI Handling**: Multiple fallbacks for ChatGPT UI changes
- **📁 Generic Naming**: Business-agnostic folder structure

## ✨ Features

### Core Functionality
- **Text Conversations**: Ask ChatGPT questions directly from Claude
- **Image Generation**: Generate images using DALL-E through ChatGPT Plus
- **File Downloads**: Actually download generated images to your file system
- **Conversation Management**: View and continue existing ChatGPT conversations
- **Enhanced M4 Mac Support**: Optimized for all Apple Silicon chips

### Advanced Capabilities
- **Multiple Download Methods**: Tries various approaches to ensure successful downloads
- **Smart Retry Logic**: Exponential backoff with configurable retry attempts
- **Error Recovery**: Detailed error messages with solution steps
- **Resource Management**: Automatic cleanup and directory size management
- **File Verification**: Ensures complete downloads before reporting success
- **Fallback Detection**: Finds recently created images if direct download fails

## 📋 Prerequisites

- **macOS** with Apple Silicon chip (M1/M2/M3/M4 supported)
- **[ChatGPT desktop app](https://chatgpt.com/download)** installed
- **ChatGPT Plus subscription** (required for DALL-E image generation)
- **[Bun](https://bun.sh/)** installed
- **[Claude desktop app](https://claude.ai/desktop)** installed

## 🚀 Installation

### NPX Installation (Recommended)

1. **Install and run using NPX:**

```bash
npx claude-chatgpt-mcp
```

2. **Configure Claude Desktop:**

Edit your `claude_desktop_config.json` file (located at `~/Library/Application Support/Claude/claude_desktop_config.json`):

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

3. **Restart Claude Desktop app**

4. **Grant permissions:**
   - Go to System Preferences > Privacy & Security > Privacy
   - Give Terminal (or iTerm) access to Accessibility features

### Manual Installation

1. **Clone this repository:**

```bash
git clone https://github.com/renzellance/claude-chatgpt-mcp.git
cd claude-chatgpt-mcp
```

2. **Install dependencies:**

```bash
bun install
```

3. **Build the project:**

```bash
bun run build
```

4. **Update Claude Desktop configuration:**

```json
{
  "mcpServers": {
    "chatgpt-mcp": {
      "command": "/Users/YOURUSERNAME/.bun/bin/bun",
      "args": ["run", "/path/to/claude-chatgpt-mcp/dist/index.js"]
    }
  }
}
```

5. **Restart Claude Desktop app**

## 💡 Usage Examples

### Text Generation
```
"Can you ask ChatGPT what the capital of France is?"
"Show me my recent ChatGPT conversations"
"Ask ChatGPT to explain quantum computing"
```

### Image Generation with Download
```
"Generate an image of a peaceful meditation scene in cartoon style"
"Create a logo design for a tech startup with modern aesthetics"
"Generate a realistic landscape image at 1792x1024 size"
```

### Advanced Operations
```
"Generate an image in watercolor style and save it to ~/Desktop"
"Create an abstract art piece and clean up the file after processing"
"Generate a minimalist design and don't auto-download the file"
```

## 🔧 Advanced Configuration

### Image Generation Options

```javascript
{
  "operation": "generate_image",
  "prompt": "A serene mountain landscape",
  "image_style": "realistic",        // Style: realistic, cartoon, abstract, etc.
  "image_size": "1024x1024",         // Size: 1024x1024, 1792x1024, 1024x1792
  "download_image": true,             // Download to file system
  "save_path": "/custom/path",        // Custom save location
  "cleanup_after": false,             // Auto-cleanup after processing
  "max_retries": 5                   // Override default retry attempts
}
```

### File Management

- **Default Location**: `~/Downloads/ChatGPT_MCP_Images/`
- **Naming Convention**: `chatgpt_TIMESTAMP_PROMPT_STYLE.png`
- **Auto-Cleanup**: Configurable cleanup based on age, size, and count
- **Conflict Resolution**: Automatic filename increments for duplicates

## 🛠️ Architecture

### Modular Design

```
src/
├── core/              # Core types and configuration
├── services/          # Business logic (ChatGPT, image download)
├── utils/             # Utilities (retry, errors, file system)
├── handlers/          # MCP request handlers
└── index.ts           # Main entry point
```

### Key Components

- **Error Handling**: Categorized errors with recovery strategies
- **Retry Logic**: Exponential backoff with smart retry decisions
- **File System**: Robust file operations with cleanup management
- **AppleScript**: Safe execution with clipboard management
- **Image Download**: Multiple strategies with verification

## 🐛 Troubleshooting

### Common Issues

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

#### Image Download Issues
```
Error: No images found in conversation
```
**Solution:**
1. Ensure ChatGPT Plus subscription is active
2. Generate an image first before attempting download
3. Wait for image generation to complete

#### M4 Mac Specific
- Ensure ChatGPT app is running natively (not under Rosetta)
- Update to latest macOS version
- Try restarting both apps if issues persist

### Debug Mode

For detailed logging, modify the config:

```typescript
// In src/core/config.ts
logging: {
  level: 'debug',
  verbose: true
}
```

## 🔒 Security & Privacy

- **Minimal Permissions**: Uses only necessary AppleScript commands
- **Clipboard Safety**: Automatically saves and restores clipboard content
- **No Data Collection**: All operations are local to your machine
- **File Cleanup**: Optional automatic cleanup of downloaded files
- **Error Handling**: No sensitive information in error messages

## 🚀 Performance Optimizations

- **Smart Caching**: Reduces redundant operations
- **Efficient Retries**: Exponential backoff prevents system overload
- **Resource Management**: Automatic cleanup prevents disk space issues
- **Optimized Scripts**: Minimal AppleScript execution time
- **Background Operations**: Non-blocking cleanup and maintenance

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
git clone https://github.com/renzellance/claude-chatgpt-mcp.git
cd claude-chatgpt-mcp
bun install
bun run dev
```

### Code Standards

- TypeScript strict mode
- Modular architecture
- Comprehensive error handling
- Documentation for all public functions
- Under 300 lines per file

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- Inspired by the need for robust ChatGPT integration
- Thanks to the Claude and ChatGPT communities

---

**Note**: This tool requires macOS and is designed specifically for the ChatGPT desktop application. Windows and Linux support may be added in future versions.
