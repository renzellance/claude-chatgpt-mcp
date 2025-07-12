#!/usr/bin/env node
/**
 * Legacy entry point - redirects to new modular structure
 * This file is kept for backward compatibility
 */

console.warn('[DEPRECATED] Using legacy index.ts. Please use src/index.ts or the built dist/index.js');
console.warn('The new modular structure provides better maintainability and features.');
console.warn('Run "npm run build" to build the new structure, then use "npm start"');

// Import and run the new modular version
import('./src/index.js').catch((error) => {
  console.error('Failed to load new modular version:', error);
  console.error('Please run "npm run build" first to compile the TypeScript source.');
  process.exit(1);
});
