#!/bin/bash
# =============================================================================
# MemoRable Secure Access Setup - OSX
# =============================================================================
# Sets up your Mac as the knight that accesses the AWS castle securely.
# No HTTP. No HTTPS scaffolding. Real security via SSM tunnel.
# =============================================================================

set -e

echo "🏰 MemoRable Secure Access Setup"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Step 1: Check Prerequisites
# -----------------------------------------------------------------------------
echo "Step 1: Checking prerequisites..."

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found${NC}"
    echo "Install with: brew install awscli"
    exit 1
fi
echo -e "${GREEN}✓ AWS CLI installed${NC}"

# Check AWS CLI version (need v2 for SSM)
AWS_VERSION=$(aws --version | cut -d/ -f2 | cut -d. -f1)
if [ "$AWS_VERSION" -lt 2 ]; then
    echo -e "${RED}❌ AWS CLI v2 required (found v$AWS_VERSION)${NC}"
    echo "Upgrade with: brew upgrade awscli"
    exit 1
fi
echo -e "${GREEN}✓ AWS CLI v2${NC}"

# Check Session Manager Plugin
if ! command -v session-manager-plugin &> /dev/null; then
    echo -e "${YELLOW}⚠ Session Manager Plugin not found${NC}"
    echo "Installing..."

    # Download and install
    curl -o "sessionmanager-bundle.zip" "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/mac_arm64/session-manager-plugin.pkg"
    sudo installer -pkg session-manager-plugin.pkg -target /
    rm -f session-manager-plugin.pkg

    echo -e "${GREEN}✓ Session Manager Plugin installed${NC}"
else
    echo -e "${GREEN}✓ Session Manager Plugin installed${NC}"
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    echo "Run: aws configure"
    echo "Or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
    exit 1
fi
echo -e "${GREEN}✓ AWS credentials configured${NC}"

IDENTITY=$(aws sts get-caller-identity --query 'Arn' --output text)
echo "   Authenticated as: $IDENTITY"

# -----------------------------------------------------------------------------
# Step 2: Detect Stack Resources
# -----------------------------------------------------------------------------
echo ""
echo "Step 2: Detecting MemoRable stack resources..."

REGION=${AWS_REGION:-us-west-2}
STACK_NAME=${MEMORABLE_STACK:-memorable}

# Get cluster name
CLUSTER=$(aws ecs list-clusters --region $REGION --query "clusterArns[?contains(@, '${STACK_NAME}')]" --output text | head -1)
if [ -z "$CLUSTER" ]; then
    echo -e "${RED}❌ No ECS cluster found for stack: $STACK_NAME${NC}"
    echo "Make sure the CloudFormation stack is deployed"
    exit 1
fi
CLUSTER_NAME=$(echo $CLUSTER | rev | cut -d/ -f1 | rev)
echo -e "${GREEN}✓ Found cluster: $CLUSTER_NAME${NC}"

# Get service name
SERVICE=$(aws ecs list-services --cluster $CLUSTER_NAME --region $REGION --query "serviceArns[0]" --output text)
SERVICE_NAME=$(echo $SERVICE | rev | cut -d/ -f1 | rev)
echo -e "${GREEN}✓ Found service: $SERVICE_NAME${NC}"

# Get task ARN
TASK_ARN=$(aws ecs list-tasks --cluster $CLUSTER_NAME --service $SERVICE_NAME --region $REGION --query "taskArns[0]" --output text)
if [ "$TASK_ARN" == "None" ] || [ -z "$TASK_ARN" ]; then
    echo -e "${RED}❌ No running tasks found${NC}"
    exit 1
fi
TASK_ID=$(echo $TASK_ARN | rev | cut -d/ -f1 | rev)
echo -e "${GREEN}✓ Found task: $TASK_ID${NC}"

# Get DocumentDB endpoint
DOCDB_ENDPOINT=$(aws docdb describe-db-clusters --region $REGION --query "DBClusters[?contains(DBClusterIdentifier, '${STACK_NAME}')].Endpoint" --output text)
if [ -z "$DOCDB_ENDPOINT" ]; then
    echo -e "${YELLOW}⚠ DocumentDB endpoint not found (may need manual config)${NC}"
else
    echo -e "${GREEN}✓ Found DocumentDB: $DOCDB_ENDPOINT${NC}"
fi

# -----------------------------------------------------------------------------
# Step 3: Create Helper Scripts
# -----------------------------------------------------------------------------
echo ""
echo "Step 3: Creating helper scripts..."

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create tunnel script
cat > "$SCRIPTS_DIR/tunnel_to_docdb.sh" << 'TUNNEL_EOF'
#!/bin/bash
# Secure tunnel to DocumentDB via SSM
# Usage: ./tunnel_to_docdb.sh

REGION=${AWS_REGION:-us-west-2}
STACK_NAME=${MEMORABLE_STACK:-memorable}
LOCAL_PORT=${1:-27017}

# Get task info
CLUSTER=$(aws ecs list-clusters --region $REGION --query "clusterArns[?contains(@, '${STACK_NAME}')]" --output text | head -1)
CLUSTER_NAME=$(echo $CLUSTER | rev | cut -d/ -f1 | rev)
SERVICE=$(aws ecs list-services --cluster $CLUSTER_NAME --region $REGION --query "serviceArns[0]" --output text)
SERVICE_NAME=$(echo $SERVICE | rev | cut -d/ -f1 | rev)
TASK_ARN=$(aws ecs list-tasks --cluster $CLUSTER_NAME --service $SERVICE_NAME --region $REGION --query "taskArns[0]" --output text)
TASK_ID=$(echo $TASK_ARN | rev | cut -d/ -f1 | rev)

# Get DocumentDB endpoint
DOCDB_ENDPOINT=$(aws docdb describe-db-clusters --region $REGION --query "DBClusters[?contains(DBClusterIdentifier, '${STACK_NAME}')].Endpoint" --output text)

echo "🔐 Starting secure tunnel to DocumentDB..."
echo "   Local port: $LOCAL_PORT → DocumentDB: $DOCDB_ENDPOINT:27017"
echo "   Press Ctrl+C to stop"
echo ""

# Start port forwarding via SSM
aws ssm start-session \
    --target "ecs:${CLUSTER_NAME}_${TASK_ID}_memorable-app" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters "{\"host\":[\"$DOCDB_ENDPOINT\"],\"portNumber\":[\"27017\"],\"localPortNumber\":[\"$LOCAL_PORT\"]}" \
    --region $REGION
TUNNEL_EOF
chmod +x "$SCRIPTS_DIR/tunnel_to_docdb.sh"
echo -e "${GREEN}✓ Created tunnel_to_docdb.sh${NC}"

# Create shell access script
cat > "$SCRIPTS_DIR/shell_access.sh" << 'SHELL_EOF'
#!/bin/bash
# Secure shell access to ECS container via SSM
# Usage: ./shell_access.sh

REGION=${AWS_REGION:-us-west-2}
STACK_NAME=${MEMORABLE_STACK:-memorable}

# Get task info
CLUSTER=$(aws ecs list-clusters --region $REGION --query "clusterArns[?contains(@, '${STACK_NAME}')]" --output text | head -1)
CLUSTER_NAME=$(echo $CLUSTER | rev | cut -d/ -f1 | rev)
SERVICE=$(aws ecs list-services --cluster $CLUSTER_NAME --region $REGION --query "serviceArns[0]" --output text)
SERVICE_NAME=$(echo $SERVICE | rev | cut -d/ -f1 | rev)
TASK_ARN=$(aws ecs list-tasks --cluster $CLUSTER_NAME --service $SERVICE_NAME --region $REGION --query "taskArns[0]" --output text)

echo "🔐 Starting secure shell to ECS container..."
echo ""

aws ecs execute-command \
    --cluster $CLUSTER_NAME \
    --task $TASK_ARN \
    --container memorable-app \
    --interactive \
    --command "/bin/sh" \
    --region $REGION
SHELL_EOF
chmod +x "$SCRIPTS_DIR/shell_access.sh"
echo -e "${GREEN}✓ Created shell_access.sh${NC}"

# Create MCP direct mode script
cat > "$SCRIPTS_DIR/mcp_direct_mode.sh" << 'MCP_EOF'
#!/bin/bash
# Start MCP in direct mode via secure tunnel
# Usage: ./mcp_direct_mode.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔐 MCP Direct Mode (Secure)"
echo "==========================="
echo ""
echo "This will:"
echo "1. Open a secure tunnel to DocumentDB"
echo "2. Set MONGODB_URI to use the tunnel"
echo "3. Unset API_BASE_URL (direct mode, not REST)"
echo ""

# Start tunnel in background
echo "Starting tunnel..."
"$SCRIPT_DIR/tunnel_to_docdb.sh" 27017 &
TUNNEL_PID=$!

# Wait for tunnel to establish
sleep 3

# Check if tunnel is running
if ! kill -0 $TUNNEL_PID 2>/dev/null; then
    echo "❌ Tunnel failed to start"
    exit 1
fi

echo "✓ Tunnel established (PID: $TUNNEL_PID)"
echo ""

# Export environment for direct mode
export MONGODB_URI="mongodb://localhost:27017/memorable?tls=true&tlsAllowInvalidCertificates=true"
unset API_BASE_URL
unset MEMORABLE_API_URL

echo "Environment configured for direct mode:"
echo "  MONGODB_URI=$MONGODB_URI"
echo "  API_BASE_URL=(unset)"
echo ""
echo "You can now run MCP tools in direct mode."
echo "Press Ctrl+C to stop the tunnel."

# Wait for Ctrl+C
trap "kill $TUNNEL_PID 2>/dev/null; echo ''; echo 'Tunnel closed.'; exit 0" INT
wait $TUNNEL_PID
MCP_EOF
chmod +x "$SCRIPTS_DIR/mcp_direct_mode.sh"
echo -e "${GREEN}✓ Created mcp_direct_mode.sh${NC}"

# -----------------------------------------------------------------------------
# Step 4: Save Configuration
# -----------------------------------------------------------------------------
echo ""
echo "Step 4: Saving configuration..."

cat > "$SCRIPTS_DIR/../.env.secure" << EOF
# MemoRable Secure Access Configuration
# Generated: $(date)

# AWS Configuration
AWS_REGION=$REGION
MEMORABLE_STACK=$STACK_NAME

# Detected Resources
ECS_CLUSTER=$CLUSTER_NAME
ECS_SERVICE=$SERVICE_NAME
DOCDB_ENDPOINT=$DOCDB_ENDPOINT

# Security Mode
# Direct mode via SSM tunnel - no HTTP/HTTPS exposure
SECURITY_MODE=bastion
EOF
echo -e "${GREEN}✓ Saved .env.secure${NC}"

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------
echo ""
echo "=============================================="
echo -e "${GREEN}✓ Secure Access Setup Complete${NC}"
echo "=============================================="
echo ""
echo "Available commands:"
echo ""
echo "  ${YELLOW}./scripts/tunnel_to_docdb.sh${NC}"
echo "      Open secure tunnel to DocumentDB on localhost:27017"
echo ""
echo "  ${YELLOW}./scripts/shell_access.sh${NC}"
echo "      Get shell access to ECS container"
echo ""
echo "  ${YELLOW}./scripts/mcp_direct_mode.sh${NC}"
echo "      Start tunnel and configure MCP for direct mode"
echo ""
echo "No HTTP. No HTTPS. Direct secure tunnel."
echo "🏰 The knight protects the castle."
