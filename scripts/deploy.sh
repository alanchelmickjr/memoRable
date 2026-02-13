#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# MemoRable — One-Click Deploy
# ═══════════════════════════════════════════════════════════════════════
#
# One command. No Docker. No database setup. Everything builds in the cloud.
# EC2 clones from GitHub, builds the image, runs MCP + MongoDB + Redis.
#
# Prerequisites: AWS CLI configured (aws configure). That's it.
#
# Usage:
#   ./scripts/deploy.sh                                        # One-click
#   MONGODB_URI="mongodb+srv://..." ./scripts/deploy.sh        # Use Atlas
#   INSTANCE_TYPE=t4g.small KEY_NAME=mykey ./scripts/deploy.sh # Customize
#
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

STACK_NAME="${STACK_NAME:-memorable}"
REGION="${AWS_REGION:-us-west-1}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.micro}"
LLM_PROVIDER="${LLM_PROVIDER:-auto}"
OAUTH_ENABLED="${OAUTH_ENABLED:-false}"
GITHUB_REPO="${GITHUB_REPO:-https://github.com/alanchelmickjr/memoRable.git}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'  GREEN='\033[0;32m'  YELLOW='\033[1;33m'  BLUE='\033[0;34m'  NC='\033[0m'
info()  { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()    { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
err()   { echo -e "${RED}[deploy]${NC} $*" >&2; }

# ─── Preflight ────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
info "MemoRable — One-Click Deploy"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if ! command -v aws &>/dev/null; then
    err "AWS CLI not found. Install: https://aws.amazon.com/cli/"
    exit 1
fi

if ! aws sts get-caller-identity &>/dev/null; then
    err "AWS CLI not configured. Run: aws configure"
    exit 1
fi

info "Region:   $REGION"
info "Stack:    $STACK_NAME"
info "Instance: $INSTANCE_TYPE"
info "Source:   $GITHUB_REPO ($GITHUB_BRANCH)"
if [ -n "${MONGODB_URI:-}" ]; then
    info "MongoDB:  external (Atlas/self-managed)"
else
    info "MongoDB:  bundled (local container)"
fi
echo ""

# ─── Deploy CloudFormation ───────────────────────────────────────────
info "Deploying stack (EC2 will clone, build, and start automatically)..."

PARAMS="InstanceType=${INSTANCE_TYPE}"
PARAMS="$PARAMS LLMProvider=${LLM_PROVIDER}"
PARAMS="$PARAMS OAuthEnabled=${OAUTH_ENABLED}"
PARAMS="$PARAMS GitHubRepo=${GITHUB_REPO}"
PARAMS="$PARAMS GitHubBranch=${GITHUB_BRANCH}"
[ -n "${MONGODB_URI:-}" ] && PARAMS="$PARAMS MongoDBUri=${MONGODB_URI}"
[ -n "${MEMORABLE_PASSPHRASE:-}" ] && PARAMS="$PARAMS MemorablePassphrase=${MEMORABLE_PASSPHRASE}"
[ -n "${ANTHROPIC_API_KEY:-}" ] && PARAMS="$PARAMS AnthropicApiKey=${ANTHROPIC_API_KEY}"
[ -n "${KEY_NAME:-}" ] && PARAMS="$PARAMS KeyName=${KEY_NAME}"

aws cloudformation deploy \
    --stack-name "$STACK_NAME" \
    --template-file "${PROJECT_DIR}/cloudformation/memorable-ec2-stack.yaml" \
    --parameter-overrides $PARAMS \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$REGION" \
    --no-fail-on-empty-changeset

# ─── Results ──────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
ok "Stack deployed!"
echo "═══════════════════════════════════════════════════════════════"
echo ""

IP=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`PublicIP`].OutputValue' --output text)

MONGO_MODE=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`MongoDBMode`].OutputValue' --output text 2>/dev/null || echo "Local")

info "MCP Endpoint:  http://${IP}:8080/mcp"
info "Health Check:  http://${IP}:8080/health"
info "MongoDB:       ${MONGO_MODE}"
info "SSH:           ssh ec2-user@${IP}"
echo ""
warn "EC2 is building the image from GitHub — health check may take 3-5 min."
echo ""
info "~\$11/mo (was \$122/mo). Daemon always running. Context always fresh."
echo ""
echo "───────────────────────────────────────────────────────────────"
ok "MCP Config (add to ~/.claude.json or .mcp.json)"
echo "───────────────────────────────────────────────────────────────"
echo ""
echo "  {"
echo "    \"mcpServers\": {"
echo "      \"memorable\": {"
echo "        \"type\": \"http\","
echo "        \"url\": \"http://${IP}:8080/mcp\""
echo "      }"
echo "    }"
echo "  }"
echo ""
echo "───────────────────────────────────────────────────────────────"
ok "Update later: ssh ec2-user@${IP} sudo /opt/memorable/update.sh"
echo "───────────────────────────────────────────────────────────────"
echo ""
