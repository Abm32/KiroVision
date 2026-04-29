'use strict';

const net = require('net');

/** Regex patterns for common dev server port output */
const PORT_PATTERNS = [
  /https?:\/\/localhost:(\d+)/i,
  /https?:\/\/127\.0\.0\.1:(\d+)/i,
  /https?:\/\/0\.0\.0\.0:(\d+)/i,
  /https?:\/\/\[::1?\]:(\d+)/i,
  /(?:listening|running|started|ready)\s+(?:on|at)\s+(?:port\s+)?:?(\d{4,5})/i,
  /port\s+(\d{4,5})/i
];

/**
 * Parse a port number from dev server stdout/stderr text.
 * @param {string} text
 * @returns {number|null}
 */
function parsePortFromOutput(text) {
  for (const pattern of PORT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const port = parseInt(match[1], 10);
      if (port > 0 && port < 65536) return port;
    }
  }
  return null;
}

/**
 * Wait for a TCP port to accept connections.
 * @param {number} port
 * @param {Object} [opts]
 * @param {number} [opts.timeout=30000]
 * @param {number} [opts.interval=500]
 * @param {string} [opts.host='127.0.0.1']
 * @returns {Promise<void>}
 */
function waitForPort(port, { timeout = 30000, interval = 500, host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;

    function attempt() {
      if (Date.now() > deadline) {
        return reject(new Error(`Port ${port} not ready after ${timeout}ms`));
      }
      const socket = net.createConnection({ port, host }, () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        setTimeout(attempt, interval);
      });
    }

    attempt();
  });
}

module.exports = { parsePortFromOutput, waitForPort };
