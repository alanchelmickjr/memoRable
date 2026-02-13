#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# MemoRable — Teardown
# ═══════════════════════════════════════════════════════════════════════
#
# Deletes the EC2 stack (VPC, instance, Elastic IP, security group, IAM).
# ECR repo is kept (delete manually if wanted).
# Run this to stop all billing. Re-deploy anytime with deploy.sh.
#
# Usage:
#   ./scripts/teardown.sh
#   STACK_NAME=memorable-prod AWS_REGION=us-west-1 ./scripts/teardown.sh
#
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

STACK_NAME="${STACK_NAME:-memorable}"
REGION="${AWS_REGION:-us-west-1}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[teardown]${NC} $*"; }
ok()    { echo -e "${GREEN}[teardown]${NC} $*"; }
warn()  { echo -e "${YELLOW}[teardown]${NC} $*"; }

info "Deleting stack: $STACK_NAME in $REGION"
echo ""

# Check if stack exists
if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &>/dev/null; then
    warn "Stack '$STACK_NAME' does not exist in $REGION. Nothing to do."
    exit 0
fi

# Get stack outputs before deletion (for reference)
PUBLIC_IP=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`PublicIP`].OutputValue' \
    --output text 2>/dev/null || echo "unknown")

MCP_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`MCPEndpoint`].OutputValue' \
    --output text 2>/dev/null || echo "unknown")

warn "This will delete:"
echo "  - EC2 instance (${STACK_NAME}-mcp-daemon)"
echo "  - Elastic IP ($PUBLIC_IP)"
echo "  - MCP endpoint ($MCP_ENDPOINT)"
echo "  - VPC, subnet, security group"
echo "  - IAM role and instance profile"
echo ""
echo "  ECR repository will be KEPT (delete manually if wanted)"
echo ""

read -p "Continue? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    info "Cancelled."
    exit 0
fi

aws cloudformation delete-stack \
    --stack-name "$STACK_NAME" \
    --region "$REGION"

info "Waiting for stack deletion..."
aws cloudformation wait stack-delete-complete \
    --stack-name "$STACK_NAME" \
    --region "$REGION"

ok "Stack '$STACK_NAME' deleted. Billing stopped."
echo ""
info "To redeploy: MONGODB_URI=<uri> ./scripts/deploy.sh"
info "To delete ECR: aws ecr delete-repository --repository-name memorable-mcp --force --region $REGION"
