/**
 * Universal Mock Server Logger Utility
 *
 * Provides consistent, colorful logging for all mock servers
 * with good visibility in both dark and light terminals
 */

// ANSI color codes optimized for both dark and light terminals
const colors = {
  // Medium intensity colors that work in both themes
  cyan: '\x1b[36m', // Cyan for server names
  green: '\x1b[32m', // Green for 2xx codes
  yellow: '\x1b[33m', // Yellow for 3xx codes
  red: '\x1b[31m', // Red for 4xx/5xx codes
  blue: '\x1b[34m', // Blue for methods
  magenta: '\x1b[35m', // Magenta for streaming
  dim: '\x1b[2m', // Dim text for timestamps/details
  reset: '\x1b[0m', // Reset color
  bold: '\x1b[1m', // Bold text
};

/**
 * Get color for HTTP status code
 */
function getStatusColor(status) {
  if (status >= 200 && status < 300) return colors.green;
  if (status >= 300 && status < 400) return colors.yellow;
  if (status >= 400) return colors.red;
  return colors.dim;
}

/**
 * Get method color
 */
function getMethodColor(method) {
  switch (method) {
    case 'GET':
      return colors.blue;
    case 'POST':
      return colors.magenta;
    case 'PUT':
      return colors.yellow;
    case 'DELETE':
      return colors.red;
    default:
      return colors.dim;
  }
}

/**
 * Format timestamp
 */
function formatTime() {
  return new Date().toISOString().split('T')[1].split('.')[0]; // HH:MM:SS
}

/**
 * Create mock server logger middleware
 * @param {string} serverName - Name of the mock server (e.g., "RHEL-LS", "ARH", "AAI")
 * @param {number} port - Server port
 * @returns {Function} Express middleware function
 */
function createMockLogger(serverName) {
  return (req, res, next) => {
    const startTime = Date.now();
    const timestamp = formatTime();

    // Check for error injection headers
    const errorType = req.headers['x-mock-error-type'];
    const errorMessage = req.headers['x-mock-error-message'];
    const errorInjection = errorType
      ? ` ${colors.red}[ERROR-INJECT: ${errorType}]${colors.reset}`
      : '';

    // Log request
    console.log(
      `${colors.dim}[${timestamp}]${colors.reset} ` +
        `${colors.cyan}${colors.bold}${serverName}${colors.reset} ` +
        `${getMethodColor(req.method)}${req.method}${colors.reset} ` +
        `${colors.dim}${req.originalUrl}${colors.reset}` +
        errorInjection
    );

    // Log error injection details if present
    if (errorType && errorMessage) {
      console.log(
        `${colors.dim}  └─ ${colors.red}Error: ${errorMessage}${colors.reset}`
      );
    }

    // Log request body for POST requests (truncated)
    if (req.method === 'POST' && req.body) {
      const bodyStr = JSON.stringify(req.body);
      const truncated =
        bodyStr.length > 100 ? bodyStr.substring(0, 100) + '...' : bodyStr;
      console.log(`${colors.dim}  └─ Body: ${truncated}${colors.reset}`);
    }

    // Check for streaming indicators
    const isStreaming =
      req.headers.accept?.includes('text/event-stream') ||
      req.headers.accept?.includes('text/plain') ||
      req.body?.stream === true;

    // Capture original response methods
    const originalJson = res.json;
    const originalSend = res.send;
    const originalEnd = res.end;

    // Override json method
    res.json = function (body) {
      logResponse(res.statusCode, 'JSON', body, startTime, isStreaming);
      return originalJson.call(this, body);
    };

    // Override send method
    res.send = function (body) {
      logResponse(res.statusCode, 'TEXT', body, startTime, isStreaming);
      return originalSend.call(this, body);
    };

    // Override end method
    res.end = function (chunk) {
      if (!res.headersSent) {
        logResponse(res.statusCode, 'END', chunk, startTime, isStreaming);
      }
      return originalEnd.call(this, chunk);
    };

    function logResponse(status, type, body, startTime, streaming) {
      const duration = Date.now() - startTime;
      const statusColor = getStatusColor(status);
      const streamingTag = streaming
        ? `${colors.magenta} [STREAM]${colors.reset}`
        : '';

      console.log(
        `${colors.dim}  └─${colors.reset} ` +
          `${statusColor}${colors.bold}${status}${colors.reset}` +
          `${streamingTag} ` +
          `${colors.dim}${duration}ms${colors.reset}`
      );

      // Log error responses in detail
      if (status >= 400) {
        let errorMsg = '';
        if (typeof body === 'object' && body?.detail) {
          errorMsg = Array.isArray(body.detail)
            ? body.detail[0]?.msg
            : body.detail;
        } else if (typeof body === 'string') {
          errorMsg = body.length > 50 ? body.substring(0, 50) + '...' : body;
        }
        if (errorMsg) {
          console.log(`${colors.red}    Error: ${errorMsg}${colors.reset}`);
        }
      }
    }

    next();
  };
}

/**
 * Log server startup
 */
function logServerStart(serverName, port, endpoints = []) {
  console.log(
    `\n${colors.cyan}${colors.bold}🚀 ${serverName} Mock Server${colors.reset}`
  );
  console.log(
    `${colors.dim}   Running on http://localhost:${port}${colors.reset}`
  );

  if (endpoints.length > 0) {
    console.log(`${colors.dim}   Endpoints:${colors.reset}`);
    endpoints.forEach((endpoint) => {
      const methodColor = getMethodColor(endpoint.method);
      console.log(
        `${colors.dim}   ${methodColor}${endpoint.method}${colors.reset} ${endpoint.path}`
      );
    });
  }

  console.log(''); // Empty line for separation
}

/**
 * Log server shutdown
 */
function logServerShutdown(serverName) {
  console.log(
    `\n${colors.yellow}🛑 Shutting down ${serverName} mock server...${colors.reset}`
  );
}

module.exports = {
  createMockLogger,
  logServerStart,
  logServerShutdown,
  colors,
};
