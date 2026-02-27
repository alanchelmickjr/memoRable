#!/usr/bin/env node
/**
 * MCP Transport Layer — StreamableHTTP client for hooks
 *
 * CLOUD ONLY — No localhost, no local Docker, no local dev. No exceptions.
 *
 * Hooks run as separate processes and can't access Claude Code's stdio pipe.
 * This talks to the MCP server's HTTP endpoint via curl (synchronous, proxy-aware).
 *
 * URL MUST come from environment variables — no hardcoded fallbacks.
 * If no URL is configured, mcpInit() returns false and the hook degrades gracefully.
 *
 * Exports: mcpInit(), mcpCall(toolName, args), isConnected(), MCP_URL
 */

const { execSync } = require('child_process');
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ─── MCP Server URL Resolution ──────────────────────────────────────────────
// CLOUD ONLY. URL must come from env. No localhost fallback.
const MCP_URL = (
  process.env.MCP_URL ||
  process.env.MEMORABLE_API_URL ||
  process.env.MEMORABLE_MCP_URL ||
  ''
).replace(/\/+$/, '');

const MCP_ENDPOINT = MCP_URL ? `${MCP_URL}/mcp` : '';

// Connection timeout (seconds) — keep short, hook must not block session start
const INIT_TIMEOUT = parseInt(process.env.MCP_INIT_TIMEOUT || '5', 10);
const CALL_TIMEOUT = parseInt(process.env.MCP_CALL_TIMEOUT || '10', 10);

let sessionId = null;
let connected = false;

// ─── Shell Escaping ─────────────────────────────────────────────────────────

function shellEscape(s) {
  if (!s) return "''";
  if (!/[^a-zA-Z0-9_\-.,/:=@]/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// ─── Synchronous HTTP via curl ──────────────────────────────────────────────
// curl respects HTTP_PROXY/HTTPS_PROXY natively — no proxy shim needed.

function curlPost(url, body, timeoutSec) {
  const headerFile = path.join(os.tmpdir(), `mcp-hdr-${process.pid}-${Date.now()}`);
  const bodyJson = JSON.stringify(body);

  const parts = [
    'curl', '-s', '-S',
    '--max-time', String(timeoutSec),
    '-X', 'POST',
    '-H', shellEscape('Content-Type: application/json'),
    '-H', shellEscape('Accept: application/json'),
  ];

  if (sessionId) {
    parts.push('-H', shellEscape(`mcp-session-id: ${sessionId}`));
  }

  parts.push('-D', shellEscape(headerFile));
  parts.push('-d', shellEscape(bodyJson));
  parts.push(shellEscape(url));

  try {
    const stdout = execSync(parts.join(' '), {
      encoding: 'utf8',
      timeout: (timeoutSec + 5) * 1000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Capture session ID from response headers
    try {
      const headers = fs.readFileSync(headerFile, 'utf8');
      const match = headers.match(/mcp-session-id:\s*(\S+)/i);
      if (match) sessionId = match[1].trim();
    } catch {}

    try { fs.unlinkSync(headerFile); } catch {}

    const trimmed = stdout.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed);
  } catch {
    try { fs.unlinkSync(headerFile); } catch {}
    return null;
  }
}

// ─── MCP Protocol ───────────────────────────────────────────────────────────

/**
 * Initialize MCP session via StreamableHTTP.
 * Sends initialize + notifications/initialized handshake.
 * Returns true if server is reachable and responsive.
 * Returns false if no URL configured or server unreachable.
 */
function mcpInit() {
  if (!MCP_ENDPOINT) {
    connected = false;
    return false;
  }

  try {
    const response = curlPost(MCP_ENDPOINT, {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'memorable-hook',
          version: '1.0.0',
        },
      },
    }, INIT_TIMEOUT);

    if (response && (response.result || response.id)) {
      connected = true;

      // Complete handshake (fire and forget)
      try {
        curlPost(MCP_ENDPOINT, {
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }, 3);
      } catch {}

      return true;
    }

    connected = false;
    return false;
  } catch {
    connected = false;
    return false;
  }
}

/**
 * Call an MCP tool by name. Returns the unwrapped result or null.
 *
 * MCP tools return { content: [{ type: 'text', text: '<json>' }] }.
 * This unwraps the JSON-RPC envelope and parses the text content.
 */
function mcpCall(toolName, args) {
  if (!connected) return null;

  try {
    const response = curlPost(MCP_ENDPOINT, {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args || {},
      },
    }, CALL_TIMEOUT);

    if (!response) return null;

    if (response.error) {
      console.error(`[mcp-transport] ${toolName}: ${response.error.message || 'unknown error'}`);
      return null;
    }

    // Unwrap MCP content array
    const content = response.result?.content;
    if (Array.isArray(content)) {
      const textBlock = content.find(c => c.type === 'text');
      if (textBlock?.text) {
        try {
          return JSON.parse(textBlock.text);
        } catch {
          return textBlock.text;
        }
      }
    }

    return response.result || null;
  } catch (e) {
    console.error(`[mcp-transport] mcpCall(${toolName}): ${e.message}`);
    return null;
  }
}

/**
 * Check if MCP session is active.
 */
function isConnected() {
  return connected;
}

module.exports = { mcpInit, mcpCall, isConnected, MCP_URL };
