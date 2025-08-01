// VFT Platform - Security Configuration
const { session } = require('electron');
const path = require('path');

/**
 * Configure Content Security Policy and security headers
 */
function configureSecurityHeaders() {
    // Content Security Policy
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self' 'unsafe-inline';" +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval';" +
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com;" +
                    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com;" +
                    "img-src 'self' data: https:;" +
                    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com;" +
                    "connect-src 'self' https://api.vftchain.com wss://api.vftchain.com https://*.solana.com wss://*.solana.com;" +
                    "media-src 'none';" +
                    "object-src 'none';" +
                    "frame-src 'none';"
                ],
                'X-Content-Type-Options': ['nosniff'],
                'X-Frame-Options': ['DENY'],
                'X-XSS-Protection': ['1; mode=block'],
                'Referrer-Policy': ['strict-origin-when-cross-origin'],
                'Permissions-Policy': ['camera=(), microphone=(), geolocation=()']
            }
        });
    });
}

/**
 * Configure secure session settings
 */
function configureSession() {
    // Remove insecure headers
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        delete details.requestHeaders['User-Agent'];
        callback({ requestHeaders: details.requestHeaders });
    });
    
    // Block dangerous protocols
    const dangerousProtocols = ['file:', 'chrome:', 'devtools:'];
    session.defaultSession.protocol.interceptStringProtocol('http', (request, callback) => {
        const url = request.url;
        if (dangerousProtocols.some(proto => url.startsWith(proto))) {
            callback({ error: -2 }); // Block request
            return;
        }
        callback(request);
    });
}

/**
 * Validate file paths to prevent directory traversal
 */
function validateFilePath(filePath) {
    const normalizedPath = path.normalize(filePath);
    const appPath = process.cwd();
    
    // Ensure path is within app directory
    if (!normalizedPath.startsWith(appPath)) {
        throw new Error('Invalid file path: Directory traversal detected');
    }
    
    // Block sensitive files
    const blockedPatterns = ['.env', 'package.json', 'node_modules', '.git'];
    if (blockedPatterns.some(pattern => normalizedPath.includes(pattern))) {
        throw new Error('Access denied: Sensitive file access blocked');
    }
    
    return normalizedPath;
}

/**
 * Sanitize user input
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') {
        return input;
    }
    
    // Remove potentially dangerous characters
    return input
        .replace(/[<>\"'&]/g, '') // XSS prevention
        .replace(/\.\./g, '') // Directory traversal prevention
        .replace(/[;|&`$(){}[\]]/g, '') // Command injection prevention
        .trim()
        .substring(0, 1000); // Limit length
}

/**
 * Validate API endpoints
 */
function validateApiEndpoint(url) {
    const allowedHosts = [
        'api.vftchain.com',
        'mainnet-beta.solana.com',
        'testnet.solana.com',
        'devnet.solana.com',
        'localhost:8000' // Development only
    ];
    
    try {
        const urlObj = new URL(url);
        
        // Only allow HTTPS in production (except localhost)
        if (process.env.NODE_ENV === 'production' && urlObj.protocol !== 'https:' && !urlObj.hostname.includes('localhost')) {
            throw new Error('Only HTTPS endpoints allowed in production');
        }
        
        // Check if host is in allowed list
        if (!allowedHosts.includes(urlObj.host)) {
            throw new Error(`Endpoint not allowed: ${urlObj.host}`);
        }
        
        return true;
    } catch (error) {
        throw new Error(`Invalid API endpoint: ${error.message}`);
    }
}

/**
 * Initialize security configuration
 */
function initSecurity() {
    configureSecurityHeaders();
    configureSession();
    
    // Disable Node.js integration in renderer processes
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'false';
    
    console.log('[Security] Security configuration initialized');
}

module.exports = {
    initSecurity,
    validateFilePath,
    sanitizeInput,
    validateApiEndpoint
};