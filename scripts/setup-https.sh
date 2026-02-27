#!/usr/bin/env bash
# Setup HTTPS reverse proxy via Caddy on EC2
# Caddy auto-provisions Let's Encrypt certs — zero config, zero cost.
#
# Prerequisites:
#   - DNS: api.memorable.chat → Elastic IP (52.9.62.72)
#   - Security group: ports 80, 443 open
#   - MCP server running on port 8080
#
# Usage: ssh ec2-user@52.9.62.72 'bash -s' < scripts/setup-https.sh

set -e

DOMAIN="${MEMORABLE_DOMAIN:-api.memorable.chat}"
MCP_PORT="${MCP_HTTP_PORT:-8080}"

echo "=== Setting up HTTPS for ${DOMAIN} → localhost:${MCP_PORT} ==="

# Install Caddy (Amazon Linux 2023 / AL2)
if ! command -v caddy &>/dev/null; then
  echo "Installing Caddy..."
  sudo dnf install -y 'dnf-command(copr)' 2>/dev/null || true
  sudo dnf copr enable -y @caddy/caddy 2>/dev/null || true
  sudo dnf install -y caddy 2>/dev/null || {
    # Fallback: direct binary
    echo "dnf install failed, downloading binary..."
    curl -sL "https://caddyserver.com/api/download?os=linux&arch=arm64" -o /tmp/caddy
    sudo mv /tmp/caddy /usr/bin/caddy
    sudo chmod +x /usr/bin/caddy
    sudo groupadd --system caddy 2>/dev/null || true
    sudo useradd --system --gid caddy --create-home --home /var/lib/caddy --shell /usr/sbin/nologin caddy 2>/dev/null || true
  }
fi

# Write Caddyfile
sudo tee /etc/caddy/Caddyfile > /dev/null <<CADDYFILE
${DOMAIN} {
    reverse_proxy localhost:${MCP_PORT}

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
    }

    log {
        output file /var/log/caddy/access.log
        format json
    }
}
CADDYFILE

# Create log directory
sudo mkdir -p /var/log/caddy
sudo chown caddy:caddy /var/log/caddy

# Enable and start Caddy
sudo systemctl enable caddy
sudo systemctl restart caddy

echo "=== Done ==="
echo "HTTPS endpoint: https://${DOMAIN}"
echo "Health check:   https://${DOMAIN}/health"
echo "MCP endpoint:   https://${DOMAIN}/mcp"
echo ""
echo "Caddy auto-provisions Let's Encrypt certs on first request."
echo "Verify: curl -s https://${DOMAIN}/health"
