#!/usr/bin/env node
/**
 * MemoRable OSX Agent
 *
 * Persistent background service that:
 * - Gathers local context (active app, location, screen state)
 * - Syncs with MemoRable cloud API
 * - Provides real-time context for Claude
 * - Runs as launchd service at login
 *
 * "Claude on all devices, constant presence" - Alan
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import os from 'os';

const execAsync = promisify(exec);

// Configuration
const config = {
  apiBase: process.env.MEMORABLE_API || 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com',
  apiKey: process.env.MEMORABLE_API_KEY || '',
  userId: process.env.MEMORABLE_USER || 'alan',
  deviceId: `osx-${os.hostname()}`,
  deviceType: 'desktop',
  syncInterval: 30000,  // 30 seconds
  contextInterval: 5000, // 5 seconds for local context
};

// Helper for authenticated API calls
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers['X-API-Key'] = config.apiKey;
  }
  return headers;
}

// Local context state
let currentContext = {
  activeApp: null,
  activeWindow: null,
  location: null,
  screenLocked: false,
  idleTime: 0,
  timestamp: null,
};

/**
 * Get the currently active application and window title
 */
async function getActiveApp() {
  try {
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        set frontWindow to ""
        try
          tell process frontApp
            set frontWindow to name of front window
          end tell
        end try
        return frontApp & "|" & frontWindow
      end tell
    `;
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    const [app, window] = stdout.trim().split('|');
    return { app, window };
  } catch (error) {
    return { app: 'unknown', window: '' };
  }
}

/**
 * Get system idle time (seconds since last user input)
 */
async function getIdleTime() {
  try {
    const { stdout } = await execAsync(
      `ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}'`
    );
    return parseInt(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

/**
 * Check if screen is locked
 */
async function isScreenLocked() {
  try {
    const { stdout } = await execAsync(
      `python3 -c "import Quartz; print(Quartz.CGSessionCopyCurrentDictionary().get('CGSSessionScreenIsLocked', 0))"`
    );
    return stdout.trim() === '1';
  } catch {
    return false;
  }
}

/**
 * Get location via IP geolocation
 */
async function getLocation() {
  try {
    const response = await fetch('http://ip-api.com/json/');
    const data = await response.json();
    return {
      city: data.city,
      region: data.regionName,
      lat: data.lat,
      lon: data.lon,
      source: 'ip',
    };
  } catch {
    return null;
  }
}

/**
 * Gather all local context
 */
async function gatherContext() {
  const [activeApp, idleTime, screenLocked] = await Promise.all([
    getActiveApp(),
    getIdleTime(),
    isScreenLocked(),
  ]);

  currentContext = {
    activeApp: activeApp.app,
    activeWindow: activeApp.window,
    idleTime,
    screenLocked,
    timestamp: new Date().toISOString(),
  };

  // Only fetch location occasionally (every 5 minutes)
  if (!currentContext.location || Date.now() - (currentContext.locationFetched || 0) > 300000) {
    currentContext.location = await getLocation();
    currentContext.locationFetched = Date.now();
  }

  return currentContext;
}

/**
 * Sync context to MemoRable cloud
 */
async function syncToCloud(context) {
  try {
    const payload = {
      userId: config.userId,
      deviceId: config.deviceId,
      deviceType: config.deviceType,
      context: {
        location: context.location?.city,
        activity: context.screenLocked ? 'away' : context.activeApp,
        activeWindow: context.activeWindow,
        idleSeconds: context.idleTime,
        isActive: !context.screenLocked && context.idleTime < 300,
      },
      timestamp: context.timestamp,
    };

    const response = await fetch(`${config.apiBase}/context/sync`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[Agent] Sync failed: ${response.status}`);
    }
  } catch (error) {
    console.error(`[Agent] Sync error: ${error.message}`);
  }
}

/**
 * Store a context change as memory (significant events only)
 */
async function storeContextChange(prev, curr) {
  // Only store significant changes
  const appChanged = prev.activeApp !== curr.activeApp;
  const becameIdle = !prev.screenLocked && curr.idleTime > 300 && prev.idleTime <= 300;
  const becameActive = (prev.screenLocked || prev.idleTime > 300) && curr.idleTime < 60;

  if (!appChanged && !becameIdle && !becameActive) return;

  let content;
  if (appChanged) {
    content = `Switched from ${prev.activeApp || 'nothing'} to ${curr.activeApp}`;
  } else if (becameIdle) {
    content = `Went idle after using ${curr.activeApp}`;
  } else if (becameActive) {
    content = `Returned to ${curr.activeApp}`;
  }

  if (!content) return;

  try {
    await fetch(`${config.apiBase}/memory`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        content,
        entities: [config.userId, 'osx_agent'],
        entityType: 'context_event',
        context: {
          location: curr.location?.city,
          device: config.deviceId,
          app: curr.activeApp,
        },
        metadata: {
          source: 'osx_agent',
          automatic: true,
        },
      }),
    });
  } catch (error) {
    console.error(`[Agent] Store error: ${error.message}`);
  }
}

/**
 * Main loop
 */
async function main() {
  console.log(`[Agent] MemoRable OSX Agent starting...`);
  console.log(`[Agent] Device: ${config.deviceId}`);
  console.log(`[Agent] API: ${config.apiBase}`);
  console.log(`[Agent] User: ${config.userId}`);

  // Initial context gather
  let prevContext = await gatherContext();
  console.log(`[Agent] Initial context: ${prevContext.activeApp} @ ${prevContext.location?.city || 'unknown'}`);

  // Context gathering loop (fast - every 5 seconds)
  setInterval(async () => {
    const newContext = await gatherContext();
    await storeContextChange(prevContext, newContext);
    prevContext = newContext;
  }, config.contextInterval);

  // Cloud sync loop (slower - every 30 seconds)
  setInterval(async () => {
    await syncToCloud(currentContext);
  }, config.syncInterval);

  // Initial sync
  await syncToCloud(currentContext);

  console.log(`[Agent] Running. Context every ${config.contextInterval/1000}s, sync every ${config.syncInterval/1000}s`);
}

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  console.log('[Agent] Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Agent] Received SIGINT, shutting down...');
  process.exit(0);
});

// Start
main().catch(error => {
  console.error('[Agent] Fatal error:', error);
  process.exit(1);
});
