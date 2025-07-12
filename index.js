#!/usr/bin/env node

// Simple compatibility shim for NPX execution
// This ensures the package works when installed via NPX

console.error('[ChatGPT MCP] Starting enhanced server...');

// Check if we're in a built environment or source environment
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  try {
    // Try to load the built version first
    const distPath = join(__dirname, 'dist', 'index.js');
    const srcPath = join(__dirname, 'src', 'index.js');
    
    let entryPoint;
    
    // Check if dist exists
    try {
      await fs.access(distPath);
      entryPoint = distPath;
      console.error('[ChatGPT MCP] Using built version from dist/');
    } catch {
      // Try src
      try {
        await fs.access(srcPath);
        entryPoint = srcPath;
        console.error('[ChatGPT MCP] Using source version from src/');
      } catch {
        console.error('[ChatGPT MCP] Building from TypeScript source...');
        // Need to build first
        const { execSync } = await import('child_process');
        execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
        entryPoint = distPath;
      }
    }
    
    // Import and run the actual server
    const serverModule = await import(entryPoint);
    // The server should start automatically when imported
    
  } catch (error) {
    console.error('[ChatGPT MCP] Failed to start server:', error);
    
    // Fallback: try to run the TypeScript directly with tsx if available
    try {
      console.error('[ChatGPT MCP] Attempting fallback with TypeScript...');
      const { execSync } = await import('child_process');
      execSync('npx tsx src/index.ts', { cwd: __dirname, stdio: 'inherit' });
    } catch (fallbackError) {
      console.error('[ChatGPT MCP] Fallback also failed:', fallbackError);
      console.error('[ChatGPT MCP] Please run "npm install && npm run build" manually');
      process.exit(1);
    }
  }
}

main().catch(error => {
  console.error('[ChatGPT MCP] Fatal error:', error);
  process.exit(1);
});
