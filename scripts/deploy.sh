#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# MemoRable — One-Click Deploy
# ═══════════════════════════════════════════════════════════════════════
#
# Deploys the MCP memory server to AWS Lambda with Function URL.
# Cost: ~$1-3/month (vs ~$122/month for the old ECS/ALB/NAT stack).
#
# Prerequisites:
#   1. AWS CLI configured (aws configure)
#   2. Docker running (for building the container image)
#   3. MongoDB Atlas M0 (free): https://cloud.mongodb.com
#
# Usage:
#   MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/memorable" ./scripts/deploy.sh
#
# Environment variables:
#   MONGODB_URI          (required) MongoDB Atlas connection string
#   AWS_REGION           (optional) Default: us-west-1
#   STACK_NAME           (optional) Default: memorable
#   LLM_PROVIDER         (optional) Default: auto (Bedrock in Lambda)
#   ANTHROPIC_API_KEY    (optional) Only if LLM_PROVIDER=anthropic
#   MEMORABLE_PASSPHRASE (optional) Auth passphrase. Empty = dev default.
#   OAUTH_ENABLED        (optional) Default: false
#   MEMORY_SIZE          (optional) Lambda MB. Default: 512
#
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────
STACK_NAME="${STACK_NAME:-memorable}"
REGION="${AWS_REGION:-us-west-1}"
ECR_REPO="${ECR_REPO:-memorable-mcp}"
LLM_PROVIDER="${LLM_PROVIDER:-auto}"
OAUTH_ENABLED="${OAUTH_ENABLED:-false}"
MEMORY_SIZE="${MEMORY_SIZE:-512}"
TIMEOUT="${TIMEOUT:-300}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()    { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
err()   { echo -e "${RED}[deploy]${NC} $*" >&2; }

# ─── Preflight Checks ────────────────────────────────────────────────
info "MemoRable Lambda Deploy — ~\$2/month, 49 MCP tools"
echo ""

# Check MongoDB URI
if [ -z "${MONGODB_URI:-}" ]; then
    err "MONGODB_URI is required."
    echo ""
    echo "  Get a free MongoDB Atlas M0 cluster at https://cloud.mongodb.com"
    echo "  Then run:"
    echo ""
    echo "    MONGODB_URI=\"mongodb+srv://user:pass@cluster.mongodb.net/memorable\" $0"
    echo ""
    exit 1
fi

# Check AWS CLI
if ! command -v aws &>/dev/null; then
    err "AWS CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
    exit 1
fi

# Check Docker
if ! command -v docker &>/dev/null; then
    err "Docker not found. Install: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info &>/dev/null; then
    err "Docker daemon not running. Start Docker and try again."
    exit 1
fi

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION")
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"

info "Region:     $REGION"
info "Stack:      $STACK_NAME"
info "ECR:        $ECR_URI"
info "LLM:        $LLM_PROVIDER"
info "Memory:     ${MEMORY_SIZE}MB"
echo ""

# ─── Step 1: Create ECR Repository ───────────────────────────────────
info "Step 1/4: Creating ECR repository..."

if aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$REGION" &>/dev/null; then
    ok "ECR repository already exists: $ECR_REPO"
else
    aws ecr create-repository \
        --repository-name "$ECR_REPO" \
        --region "$REGION" \
        --image-scanning-configuration scanOnPush=true \
        --output text --query 'repository.repositoryUri' >/dev/null
    ok "ECR repository created: $ECR_REPO"
fi

# ─── Step 2: Build Docker Image ──────────────────────────────────────
info "Step 2/4: Building Docker image..."

cd "$PROJECT_DIR"
docker build \
    -f Dockerfile.lambda \
    -t "$ECR_REPO:latest" \
    --platform linux/amd64 \
    .
ok "Docker image built: $ECR_REPO:latest"

# ─── Step 3: Push to ECR ─────────────────────────────────────────────
info "Step 3/4: Pushing image to ECR..."

# Authenticate Docker with ECR
aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Tag and push
docker tag "${ECR_REPO}:latest" "${ECR_URI}:latest"

PUSH_RETRIES=4
PUSH_DELAY=2
for i in $(seq 1 $PUSH_RETRIES); do
    if docker push "${ECR_URI}:latest"; then
        ok "Image pushed to ECR"
        break
    fi
    if [ "$i" -eq "$PUSH_RETRIES" ]; then
        err "Failed to push after $PUSH_RETRIES attempts"
        exit 1
    fi
    warn "Push failed, retrying in ${PUSH_DELAY}s... (attempt $i/$PUSH_RETRIES)"
    sleep "$PUSH_DELAY"
    PUSH_DELAY=$((PUSH_DELAY * 2))
done

# ─── Step 4: Deploy CloudFormation ───────────────────────────────────
info "Step 4/4: Deploying CloudFormation stack..."

# Build parameter overrides
PARAMS="ImageUri=${ECR_URI}:latest"
PARAMS="$PARAMS MongoDBUri=${MONGODB_URI}"
PARAMS="$PARAMS LLMProvider=${LLM_PROVIDER}"
PARAMS="$PARAMS OAuthEnabled=${OAUTH_ENABLED}"
PARAMS="$PARAMS MemorySize=${MEMORY_SIZE}"
PARAMS="$PARAMS Timeout=${TIMEOUT}"

if [ -n "${MEMORABLE_PASSPHRASE:-}" ]; then
    PARAMS="$PARAMS MemorablePassphrase=${MEMORABLE_PASSPHRASE}"
fi
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    PARAMS="$PARAMS AnthropicApiKey=${ANTHROPIC_API_KEY}"
fi

# Deploy with retry for network issues
DEPLOY_RETRIES=4
DEPLOY_DELAY=2
for i in $(seq 1 $DEPLOY_RETRIES); do
    if aws cloudformation deploy \
        --stack-name "$STACK_NAME" \
        --template-file "${PROJECT_DIR}/cloudformation/memorable-lambda-stack.yaml" \
        --parameter-overrides $PARAMS \
        --capabilities CAPABILITY_NAMED_IAM \
        --region "$REGION" \
        --no-fail-on-empty-changeset; then
        ok "CloudFormation stack deployed: $STACK_NAME"
        break
    fi
    if [ "$i" -eq "$DEPLOY_RETRIES" ]; then
        err "CloudFormation deploy failed after $DEPLOY_RETRIES attempts"
        err "Check: aws cloudformation describe-stack-events --stack-name $STACK_NAME --region $REGION"
        exit 1
    fi
    warn "Deploy failed, retrying in ${DEPLOY_DELAY}s... (attempt $i/$DEPLOY_RETRIES)"
    sleep "$DEPLOY_DELAY"
    DEPLOY_DELAY=$((DEPLOY_DELAY * 2))
done

# ─── Output Results ──────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
ok "MemoRable deployed successfully!"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Get stack outputs
FUNCTION_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`FunctionUrl`].OutputValue' \
    --output text)

MCP_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`MCPEndpoint`].OutputValue' \
    --output text)

info "Function URL:  $FUNCTION_URL"
info "MCP Endpoint:  $MCP_ENDPOINT"
info "Health Check:  ${FUNCTION_URL}health"
echo ""

# Show Claude Code config
info "To add to Claude Code, put this in ~/.claude.json under mcpServers:"
echo ""
echo "  \"memorable\": {"
echo "    \"type\": \"stdio\","
echo "    \"command\": \"npx\","
echo "    \"args\": [\"tsx\", \"$(realpath "$PROJECT_DIR/src/services/mcp_server/index.ts")\"],"
echo "    \"env\": {"
echo "      \"MEMORABLE_API_URL\": \"${FUNCTION_URL}\","
echo "      \"USE_REMOTE_API\": \"true\","
echo "      \"ALLOW_HTTP_DEV\": \"true\""
echo "    }"
echo "  }"
echo ""

# Test health check
info "Testing health check..."
if curl -sf "${FUNCTION_URL}health" | head -c 200; then
    echo ""
    ok "Health check passed!"
else
    warn "Health check failed (Lambda cold start may take 10-20s). Try again in a moment:"
    echo "  curl ${FUNCTION_URL}health"
fi

echo ""
info "Estimated cost: ~\$1-3/month"
info "Old stack was:  ~\$122/month (NAT=\$32 + ALB=\$16 + ECS=\$37 + Redis=\$12 + VPC=\$22)"
echo ""
