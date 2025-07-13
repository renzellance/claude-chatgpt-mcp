# Security Policy

## Security Features

This project has been hardened against common security vulnerabilities with the following protections:

### 🔒 Implemented Security Measures

#### 1. **AppleScript Injection Prevention**
- **Risk**: HIGH - Malicious code execution through AppleScript
- **Protection**: Comprehensive input sanitization that escapes all dangerous characters
- **Implementation**: `sanitizeForAppleScript()` function in `src/utils/security.ts`

#### 2. **Path Traversal Protection** 
- **Risk**: MEDIUM - Unauthorized file system access
- **Protection**: Path validation that prevents directory traversal attacks
- **Implementation**: `validateSavePath()` function with strict path validation

#### 3. **Rate Limiting**
- **Risk**: MEDIUM - Abuse and DoS attacks
- **Protection**: Request throttling (5 requests per minute by default)
- **Implementation**: Global rate limiter with configurable limits

#### 4. **Input Validation**
- **Risk**: MEDIUM - Malformed data causing crashes or unexpected behavior
- **Protection**: Type checking, length limits, and content validation
- **Implementation**: Throughout all user-facing functions

#### 5. **Error Sanitization**
- **Risk**: LOW - Information disclosure through error messages
- **Protection**: Removal of sensitive information from error messages
- **Implementation**: `sanitizeErrorMessage()` function

#### 6. **File Validation**
- **Risk**: MEDIUM - Malicious file operations
- **Protection**: File type validation, size limits, and directory restrictions
- **Implementation**: Enhanced file system utilities

## Security Testing

Run the security test suite:

```bash
npm run security-test
```

This validates:
- AppleScript injection protection
- Path traversal prevention
- Rate limiting functionality
- Input validation
- File validation

## Reporting Security Issues

If you discover a security vulnerability, please follow responsible disclosure:

1. **DO NOT** open a public GitHub issue
2. Email security concerns to: [maintainer-email]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Security Best Practices for Users

### Installation
- Always install from official sources (npm, GitHub releases)
- Verify package integrity with `npm audit`
- Keep dependencies updated

### Configuration
- Use default security settings unless you understand the implications
- Restrict file system permissions where possible
- Monitor logs for suspicious activity

### Usage
- Don't disable security features
- Be cautious with custom file paths
- Report unexpected behavior

## Changelog

### Version 2.2.0 - Security Hardening Release
- **BREAKING**: Enhanced input validation may reject previously accepted inputs
- **NEW**: Comprehensive security test suite
- **FIXED**: AppleScript injection vulnerability (CVE-TBD)
- **FIXED**: Path traversal vulnerability (CVE-TBD)
- **ADDED**: Rate limiting protection
- **ADDED**: Error message sanitization
- **ADDED**: File validation and size limits

## Security Considerations

### AppleScript Security
This tool uses AppleScript to interact with the ChatGPT desktop app. While we've implemented strong protections:

- All user inputs are sanitized before AppleScript execution
- No shell commands are executed directly
- File operations are restricted to designated directories
- Rate limiting prevents abuse

### System Permissions
The tool requires:
- **Accessibility permissions** (for UI automation)
- **File system access** (limited to designated download directories)

These permissions are necessary for functionality but are used securely.

### Network Security
- No external network requests beyond ChatGPT app interaction
- No data transmission to third parties
- All operations are local to your machine

## Implementation Details

### Input Sanitization
```typescript
function sanitizeForAppleScript(input: string): string {
  return input
    .replace(/\\/g, '\\\\')     // Escape backslashes
    .replace(/"/g, '\\"')       // Escape quotes
    .replace(/'/g, "\\'")       // Escape single quotes
    .replace(/\n/g, '\\n')      // Escape newlines
    .replace(/\r/g, '\\r')      // Escape carriage returns
    .replace(/\t/g, '\\t')      // Escape tabs
    .replace(/\0/g, '')         // Remove null characters
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
}
```

### Path Validation
```typescript
function validateSavePath(customPath: string, allowedBaseDir: string): string {
  const resolvedPath = path.resolve(customPath);
  const allowedPath = path.resolve(allowedBaseDir);
  
  if (!resolvedPath.startsWith(allowedPath + path.sep)) {
    throw new Error('Path traversal detected');
  }
  
  return resolvedPath;
}
```

### Rate Limiting
- Default: 5 requests per minute per operation type
- Configurable limits
- Memory-based (resets on restart)
- Per-operation-type tracking

## Compliance

This security implementation follows:
- OWASP Top 10 security guidelines
- Secure coding best practices
- Principle of least privilege
- Defense in depth strategy

## Maintenance

Security measures are:
- Tested on every build
- Reviewed regularly
- Updated with new threat intelligence
- Documented for transparency

## Contact

For security-related questions or concerns:
- Security issues: [Follow responsible disclosure above]
- General questions: Open a GitHub issue
- Documentation: Check README.md

---

**Last Updated**: July 2025  
**Security Version**: 2.2.0
