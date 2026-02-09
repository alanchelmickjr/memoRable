#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# MemoRable — One-Click Deploy
# ═══════════════════════════════════════════════════════════════════════
#
# Always-on MCP daemon with Redis core. EC2 + Docker (MCP + Redis) + EIP.
# The daemon runs continuously — preparing context before you ask for it.
#
# Prerequisites:
#   1. AWS CLI configured (aws configure)
#   2. Docker running locally (for building the image)
#   3. MongoDB Atlas M0 (free): https://cloud.mongodb.com
#
# Usage:
#   MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/memorable" ./scripts/deploy.sh
#
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

STACK_NAME="${STACK_NAME:-memorable}"
REGION="${AWS_REGION:-us-west-1}"
ECR_REPO="${ECR_REPO:-memorable-mcp}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.micro}"
LLM_PROVIDER="${LLM_PROVIDER:-auto}"
OAUTH_ENABLED="${OAUTH_ENABLED:-false}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'  GREEN='\033[0;32m'  YELLOW='\033[1;33m'  BLUE='\033[0;34m'  NC='\033[0m'
info()  { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()    { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
err()   { echo -e "${RED}[deploy]${NC} $*" >&2; }

# ─── Preflight ────────────────────────────────────────────────────────
info "MemoRable deploy — always-on daemon with Redis core"
echo ""

if [ -z "${MONGODB_URI:-}" ]; then
    err "MONGODB_URI is required."
    echo "  Free M0 at https://cloud.mongodb.com"
    echo "  MONGODB_URI=\"mongodb+srv://...\" $0"
    exit 1
fi

for cmd in aws docker; do
    if ! command -v "$cmd" &>/dev/null; then
        err "$cmd not found."
        exit 1
    fi
done

if ! docker info &>/dev/null; then
    err "Docker daemon not running."
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION")
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"

info "Region:   $REGION"
info "Stack:    $STACK_NAME"
info "Instance: $INSTANCE_TYPE"
info "ECR:      $ECR_URI"
echo ""

# ─── Step 1: ECR Repository ──────────────────────────────────────────
info "Step 1/4: ECR repository..."
aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$REGION" &>/dev/null || \
    aws ecr create-repository --repository-name "$ECR_REPO" --region "$REGION" \
        --image-scanning-configuration scanOnPush=true >/dev/null
ok "ECR ready: $ECR_REPO"

# ─── Step 2: Build Docker image ──────────────────────────────────────
info "Step 2/4: Building image..."
cd "$PROJECT_DIR"
docker build -f Dockerfile.lambda -t "$ECR_REPO:latest" --platform linux/arm64 .
ok "Image built"

# ─── Step 3: Push to ECR ─────────────────────────────────────────────
info "Step 3/4: Pushing to ECR..."
aws ecr get-login-password --region "$REGION" | \
    docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

docker tag "${ECR_REPO}:latest" "${ECR_URI}:latest"

RETRIES=4  DELAY=2
for i in $(seq 1 $RETRIES); do
    docker push "${ECR_URI}:latest" && break
    [ "$i" -eq "$RETRIES" ] && { err "Push failed after $RETRIES attempts"; exit 1; }
    warn "Retry in ${DELAY}s ($i/$RETRIES)..."
    sleep "$DELAY"; DELAY=$((DELAY * 2))
done
ok "Image pushed"

# ─── Step 4: Deploy CloudFormation ───────────────────────────────────
info "Step 4/4: Deploying stack..."
PARAMS="ImageUri=${ECR_URI}:latest"
PARAMS="$PARAMS MongoDBUri=${MONGODB_URI}"
PARAMS="$PARAMS InstanceType=${INSTANCE_TYPE}"
PARAMS="$PARAMS LLMProvider=${LLM_PROVIDER}"
PARAMS="$PARAMS OAuthEnabled=${OAUTH_ENABLED}"
[ -n "${MEMORABLE_PASSPHRASE:-}" ] && PARAMS="$PARAMS MemorablePassphrase=${MEMORABLE_PASSPHRASE}"
[ -n "${ANTHROPIC_API_KEY:-}" ] && PARAMS="$PARAMS AnthropicApiKey=${ANTHROPIC_API_KEY}"
[ -n "${KEY_NAME:-}" ] && PARAMS="$PARAMS KeyName=${KEY_NAME}"

RETRIES=4  DELAY=2
for i in $(seq 1 $RETRIES); do
    aws cloudformation deploy \
        --stack-name "$STACK_NAME" \
        --template-file "${PROJECT_DIR}/cloudformation/memorable-lambda-stack.yaml" \
        --parameter-overrides $PARAMS \
        --capabilities CAPABILITY_NAMED_IAM \
        --region "$REGION" \
        --no-fail-on-empty-changeset && break
    [ "$i" -eq "$RETRIES" ] && { err "Deploy failed"; exit 1; }
    warn "Retry in ${DELAY}s ($i/$RETRIES)..."
    sleep "$DELAY"; DELAY=$((DELAY * 2))
done
ok "Stack deployed"

# ─── Results ──────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
ok "MemoRable is running!"
echo "═══════════════════════════════════════════════════════════════"
echo ""

IP=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`PublicIP`].OutputValue' --output text)

info "MCP Endpoint:  http://${IP}:8080/mcp"
info "Health Check:  http://${IP}:8080/health"
info "SSH:           ssh ec2-user@${IP}"
echo ""
info "~\$11/mo (was \$122/mo). Daemon always running. Redis core. Context always fresh."
echo ""
