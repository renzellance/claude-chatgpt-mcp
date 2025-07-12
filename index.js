#!/usr/bin/env node

// Enhanced compatibility shim with better error handling and debugging
console.error('[ChatGPT MCP] Starting enhanced server v2.0.1...');

import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Enhanced error handling
process.on('uncaughtException', (error) => {
  console.error('[ChatGPT MCP] UNCAUGHT EXCEPTION:', error);
  console.error('[ChatGPT MCP] Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[ChatGPT MCP] UNHANDLED REJECTION at:', promise, 'reason:', reason);
  process.exit(1);
});

async function main() {
  try {
    console.error('[ChatGPT MCP] Checking for built version...');
    
    // Check if dist exists and is built
    const distIndexPath = join(__dirname, 'dist', 'index.js');
    let needsBuild = true;
    
    try {
      await fs.access(distIndexPath);
      console.error('[ChatGPT MCP] Found built version at:', distIndexPath);
      needsBuild = false;
    } catch {
      console.error('[ChatGPT MCP] No built version found, will build from source');
    }
    
    // Build if needed
    if (needsBuild) {
      console.error('[ChatGPT MCP] Building TypeScript source...');
      const { execSync } = await import('child_process');
      
      try {
        // Install dependencies first
        console.error('[ChatGPT MCP] Installing dependencies...');
        execSync('npm install', { 
          cwd: __dirname, 
          stdio: ['ignore', 'ignore', 'pipe'],
          encoding: 'utf8'
        });
        
        // Build the project
        console.error('[ChatGPT MCP] Compiling TypeScript...');
        execSync('npm run build', { 
          cwd: __dirname, 
          stdio: ['ignore', 'ignore', 'pipe'],
          encoding: 'utf8'
        });
        
        console.error('[ChatGPT MCP] Build completed successfully');
      } catch (buildError) {
        console.error('[ChatGPT MCP] Build failed:', buildError);
        
        // Try alternative: run TypeScript directly
        console.error('[ChatGPT MCP] Attempting to run TypeScript source directly...');
        try {
          // Try to run with tsx (TypeScript executor)
          execSync('npx tsx src/index.ts', { 
            cwd: __dirname, 
            stdio: 'inherit'
          });
          return; // If successful, exit here
        } catch (tsxError) {
          console.error('[ChatGPT MCP] Direct TypeScript execution also failed:', tsxError);
          throw new Error(`Build failed and direct execution failed. Build error: ${buildError}. TSX error: ${tsxError}`);
        }
      }
    }
    
    // Verify the built file exists
    try {
      await fs.access(distIndexPath);
      console.error('[ChatGPT MCP] Loading built server from:', distIndexPath);
    } catch {
      throw new Error(`Built file not found at ${distIndexPath} after build`);
    }
    
    // Import and run the built server
    const serverModule = await import(distIndexPath);
    console.error('[ChatGPT MCP] Server module loaded successfully');
    
    // The server should start automatically when the module is imported
    // But let's add a small delay to see any startup messages
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.error('[ChatGPT MCP] Server should now be running...');
    
  } catch (error) {
    console.error('[ChatGPT MCP] FATAL ERROR during startup:', error);
    console.error('[ChatGPT MCP] Error stack:', error.stack);
    
    // Try one more fallback with more detailed error info
    try {
      console.error('[ChatGPT MCP] Attempting emergency fallback...');
      const srcIndexPath = join(__dirname, 'src', 'index.ts');
      
      // Check if source exists
      await fs.access(srcIndexPath);
      console.error('[ChatGPT MCP] Source file found, trying Node.js with --loader...');
      
      const { spawn } = await import('child_process');
      const child = spawn('node', [
        '--loader', 'tsx/esm',
        srcIndexPath
      ], {
        cwd: __dirname,
        stdio: 'inherit'
      });
      
      child.on('error', (err) => {
        console.error('[ChatGPT MCP] Emergency fallback failed:', err);
        process.exit(1);
      });
      
      return; // Let the child process take over
      
    } catch (fallbackError) {
      console.error('[ChatGPT MCP] All fallback attempts failed:', fallbackError);
      console.error('[ChatGPT MCP] Please manually run: cd', __dirname, '&& npm install && npm run build && npm start');
      process.exit(1);
    }
  }
}

console.error('[ChatGPT MCP] Initializing...');
main().catch(error => {
  console.error('[ChatGPT MCP] Main function failed:', error);
  process.exit(1);
});
