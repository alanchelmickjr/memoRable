#!/usr/bin/env bash
# MemoRable — Orin Nano 8GB Native Setup
# Target: NVIDIA Jetson Orin Nano 8GB on JetPack 6.x (L4T/Ubuntu 22.04)
# Purpose: Edge sensor node — battery-powered prototype
#
# This script installs and configures MemoRable as native systemd services.
# No Docker. No containers. Direct process management for minimal overhead
# and safe behavior on battery-interrupted hardware.
#
# Usage: sudo bash setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INSTALL_DIR="/opt/memorable"
SERVICE_USER="memorable"

# ─── Colors ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ─── Preflight ────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Run as root: sudo bash setup.sh"

info "Detecting platform..."
ARCH=$(uname -m)
[[ "$ARCH" != "aarch64" ]] && error "Expected aarch64, got $ARCH. This script is for Jetson Orin Nano."

# Check for JetPack/L4T
if [[ -f /etc/nv_tegra_release ]]; then
    info "Tegra platform detected: $(head -1 /etc/nv_tegra_release)"
else
    warn "No /etc/nv_tegra_release found. Proceeding anyway but CUDA may not work."
fi

# Check available memory
TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_MEM_MB=$((TOTAL_MEM_KB / 1024))
info "Total memory: ${TOTAL_MEM_MB}MB"
[[ $TOTAL_MEM_MB -lt 6000 ]] && warn "Less than 6GB detected. Memory budgets may need adjustment."

# ─── System dependencies ─────────────────────────────────────────────
info "Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq \
    curl \
    build-essential \
    python3 \
    git \
    jq \
    nvme-cli \
    > /dev/null 2>&1

# ─── Node.js 23 (ARM64) ──────────────────────────────────────────────
if command -v node &>/dev/null && [[ "$(node -v | cut -d. -f1 | tr -d v)" -ge 23 ]]; then
    info "Node.js $(node -v) already installed"
else
    info "Installing Node.js 23 (ARM64)..."
    curl -fsSL https://deb.nodesource.com/setup_23.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
    info "Node.js $(node -v) installed"
fi

# tsx for running TypeScript directly
npm list -g tsx &>/dev/null || npm install -g tsx --quiet

# ─── MongoDB 7 (ARM64) ───────────────────────────────────────────────
if command -v mongod &>/dev/null; then
    info "MongoDB already installed: $(mongod --version | head -1)"
else
    info "Installing MongoDB 7 (ARM64)..."
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
        gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
    echo "deb [ arch=arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
        > /etc/apt/sources.list.d/mongodb-org-7.0.list
    apt-get update -qq
    apt-get install -y -qq mongodb-org > /dev/null 2>&1
    info "MongoDB installed"
fi

# ─── Redis (from repo) ───────────────────────────────────────────────
if command -v redis-server &>/dev/null; then
    info "Redis already installed: $(redis-server --version)"
else
    info "Installing Redis..."
    apt-get install -y -qq redis-server > /dev/null 2>&1
    info "Redis installed"
fi

# ─── Create service user ─────────────────────────────────────────────
if id "$SERVICE_USER" &>/dev/null; then
    info "User '$SERVICE_USER' exists"
else
    info "Creating service user '$SERVICE_USER'..."
    useradd --system --shell /usr/sbin/nologin --home-dir "$INSTALL_DIR" "$SERVICE_USER"
fi

# ─── Install MemoRable ───────────────────────────────────────────────
info "Installing MemoRable to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp -r "$PROJECT_ROOT/src" "$INSTALL_DIR/"
cp "$PROJECT_ROOT/package.json" "$INSTALL_DIR/"
cp "$PROJECT_ROOT/package-lock.json" "$INSTALL_DIR/" 2>/dev/null || true
cp "$PROJECT_ROOT/tsconfig.json" "$INSTALL_DIR/"

# Use edge-specific env
if [[ -f "$SCRIPT_DIR/.env.orin-nano" ]]; then
    cp "$SCRIPT_DIR/.env.orin-nano" "$INSTALL_DIR/.env"
    info "Copied .env.orin-nano as .env"
else
    warn "No .env.orin-nano found — copy .env.example and tune manually"
    cp "$PROJECT_ROOT/.env.example" "$INSTALL_DIR/.env"
fi

cd "$INSTALL_DIR"
info "Installing Node dependencies (production only)..."
npm ci --omit=dev --quiet 2>&1 || npm install --omit=dev --quiet 2>&1

chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

# ─── Configure MongoDB for low memory ────────────────────────────────
info "Configuring MongoDB for constrained memory..."
cat > /etc/mongod.conf.d/orin-nano.conf 2>/dev/null <<'MONGOCONF' || true
# Orin Nano 8GB — MongoDB WiredTiger tuning
# 512MB cache max (8GB shared with GPU + app + OS)
storage:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.5
      journalCompressor: snappy
    collectionConfig:
      blockCompressor: snappy
net:
  bindIp: 127.0.0.1
  port: 27017
MONGOCONF

# If mongod.conf doesn't include the conf.d directory, patch it directly
if ! grep -q "cacheSizeGB" /etc/mongod.conf 2>/dev/null; then
    # Patch inline — set WiredTiger cache to 512MB
    if grep -q "wiredTiger" /etc/mongod.conf 2>/dev/null; then
        info "mongod.conf already has wiredTiger section — verify cacheSizeGB manually"
    else
        cat >> /etc/mongod.conf <<'MONGOPATCH'

# Orin Nano memory constraint — 512MB WiredTiger cache
storage:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.5
MONGOPATCH
        info "Patched mongod.conf with 512MB WiredTiger cache"
    fi
fi

# ─── Configure Redis for low memory ──────────────────────────────────
info "Configuring Redis for constrained memory..."
cat > /etc/redis/redis-orin-nano.conf <<'REDISCONF'
# Orin Nano 8GB — Redis tuning
# 256MB max memory (context frames, caching, sessions)
maxmemory 256mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
appendonly no
# Reduce background save memory overhead
rdbcompression yes
rdbchecksum no
REDISCONF

# Include from main redis.conf if possible
if ! grep -q "redis-orin-nano" /etc/redis/redis.conf 2>/dev/null; then
    echo "include /etc/redis/redis-orin-nano.conf" >> /etc/redis/redis.conf
    info "Linked Redis Orin Nano config"
fi

# ─── Install systemd units ───────────────────────────────────────────
info "Installing systemd service units..."
cp "$SCRIPT_DIR/systemd/memorable-mcp.service" /etc/systemd/system/
systemctl daemon-reload

# ─── Enable services ─────────────────────────────────────────────────
info "Enabling services..."
systemctl enable mongod
systemctl enable redis-server
systemctl enable memorable-mcp

info "Starting services..."
systemctl start mongod
systemctl start redis-server
systemctl start memorable-mcp

# ─── Verify ──────────────────────────────────────────────────────────
sleep 2
info "Service status:"
for svc in mongod redis-server memorable-mcp; do
    STATUS=$(systemctl is-active "$svc" 2>/dev/null || echo "inactive")
    if [[ "$STATUS" == "active" ]]; then
        echo -e "  ${GREEN}${svc}${NC}: $STATUS"
    else
        echo -e "  ${RED}${svc}${NC}: $STATUS"
    fi
done

# ─── Memory budget summary ───────────────────────────────────────────
echo ""
info "Memory budget (8GB unified RAM):"
echo "  OS + JetPack/CUDA runtime:      ~1.5 GB"
echo "  OAK-D DepthAI pipeline:         ~0.3 GB"
echo "  AEC audio processing:            ~0.1 GB"
echo "  Gemma 2 2B Q4 + LoRA:           ~1.5 GB"
echo "  Hume preprocessing:              ~0.3 GB"
echo "  MongoDB (WiredTiger cache):       0.5 GB"
echo "  Redis:                            0.25 GB"
echo "  Node.js (MemoRable MCP):         0.5 GB"
echo "  Headroom:                        ~3.0 GB"
echo ""
info "Setup complete. Logs: journalctl -u memorable-mcp -f"
