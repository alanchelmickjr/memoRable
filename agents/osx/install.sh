#!/bin/bash
# MemoRable OSX Agent Installer
#
# Installs the agent as a launchd service that runs at login
# Claude on all devices, constant presence

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.memorable.agent.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

echo "🧠 MemoRable OSX Agent Installer"
echo "================================"
echo ""

# Check for node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    echo "   brew install node"
    exit 1
fi

echo "✓ Node.js found: $(node -v)"

# Create LaunchAgents directory if needed
mkdir -p "$LAUNCH_AGENTS_DIR"

# Copy and configure plist
echo "📝 Installing launchd service..."
PLIST_PATH="$LAUNCH_AGENTS_DIR/$PLIST_NAME"

# Replace AGENT_PATH placeholder with actual path
sed "s|AGENT_PATH|$SCRIPT_DIR|g" "$SCRIPT_DIR/$PLIST_NAME" > "$PLIST_PATH"

echo "✓ Installed plist to $PLIST_PATH"

# Unload if already loaded
if launchctl list | grep -q "com.memorable.agent"; then
    echo "🔄 Unloading existing agent..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# Load the agent
echo "🚀 Starting agent..."
launchctl load "$PLIST_PATH"

# Check if running
sleep 2
if launchctl list | grep -q "com.memorable.agent"; then
    echo "✓ Agent is running!"
    echo ""
    echo "📊 Logs:"
    echo "   stdout: /tmp/memorable-agent.log"
    echo "   stderr: /tmp/memorable-agent.error.log"
    echo ""
    echo "🔧 Commands:"
    echo "   Stop:    launchctl unload ~/Library/LaunchAgents/$PLIST_NAME"
    echo "   Start:   launchctl load ~/Library/LaunchAgents/$PLIST_NAME"
    echo "   Restart: launchctl kickstart -k gui/\$(id -u)/com.memorable.agent"
    echo "   Logs:    tail -f /tmp/memorable-agent.log"
    echo ""
    echo "✅ Installation complete!"
else
    echo "❌ Agent failed to start. Check logs:"
    echo "   cat /tmp/memorable-agent.error.log"
    exit 1
fi
