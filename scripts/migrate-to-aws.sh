#!/bin/bash
#
# MemoRable Memory Migration - Local to AWS
# Uploads snapshots and restores memories to cloud infrastructure
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - CloudFormation stack deployed (get outputs first)
#   - Local snapshots exist in ./snapshots/
#
# Usage:
#   ./scripts/migrate-to-aws.sh --stack-name memorable-prod
#   ./scripts/migrate-to-aws.sh --stack-name memorable-prod --snapshot wires-connected-3am
#   ./scripts/migrate-to-aws.sh --list-snapshots
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SNAPSHOTS_DIR="${PROJECT_DIR}/snapshots"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default values
STACK_NAME=""
SNAPSHOT_NAME=""
AWS_REGION="${AWS_REGION:-us-west-2}"

usage() {
    echo "MemoRable Memory Migration - Local to AWS"
    echo ""
    echo "Usage:"
    echo "  $0 --stack-name <name> [--snapshot <name>] [--region <region>]"
    echo "  $0 --list-snapshots"
    echo ""
    echo "Options:"
    echo "  --stack-name    CloudFormation stack name (required for migration)"
    echo "  --snapshot      Specific snapshot to migrate (default: latest)"
    echo "  --region        AWS region (default: us-west-2)"
    echo "  --list-snapshots List available local snapshots"
    echo ""
    echo "Examples:"
    echo "  $0 --stack-name memorable-prod"
    echo "  $0 --stack-name memorable-prod --snapshot 20260113-043748-memories-bootstrapped"
    echo ""
}

list_snapshots() {
    echo -e "${GREEN}Available local snapshots:${NC}"
    echo ""
    if [ -d "$SNAPSHOTS_DIR" ] && [ "$(ls -A $SNAPSHOTS_DIR 2>/dev/null)" ]; then
        for snap in "$SNAPSHOTS_DIR"/*; do
            if [ -d "$snap" ]; then
                name=$(basename "$snap")
                mongo_size=$(du -sh "$snap/mongodb" 2>/dev/null | cut -f1 || echo "missing")
                weaviate_size=$(du -sh "$snap/weaviate" 2>/dev/null | cut -f1 || echo "missing")
                obj_count=$(jq '.objects | length' "$snap/weaviate/objects.json" 2>/dev/null || echo "?")
                echo -e "  ${YELLOW}$name${NC}"
                echo "    MongoDB: $mongo_size | Weaviate: $weaviate_size ($obj_count objects)"
            fi
        done
    else
        echo "  (no snapshots found)"
    fi
    echo ""
}

get_latest_snapshot() {
    ls -t "$SNAPSHOTS_DIR" 2>/dev/null | head -1
}

get_stack_outputs() {
    echo -e "${CYAN}Fetching CloudFormation stack outputs...${NC}"

    OUTPUTS=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs' \
        --output json 2>/dev/null)

    if [ -z "$OUTPUTS" ] || [ "$OUTPUTS" == "null" ]; then
        echo -e "${RED}Error: Could not fetch stack outputs. Is the stack deployed?${NC}"
        exit 1
    fi

    S3_BUCKET=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="SnapshotBucket") | .OutputValue')
    DOCDB_ENDPOINT=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="DocumentDBEndpoint") | .OutputValue')
    INGESTION_URL=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="IngestionAPI") | .OutputValue')
    WEAVIATE_INTERNAL=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="WeaviateEndpoint") | .OutputValue')

    echo -e "  S3 Bucket: ${GREEN}$S3_BUCKET${NC}"
    echo -e "  DocumentDB: ${GREEN}$DOCDB_ENDPOINT${NC}"
    echo -e "  Ingestion API: ${GREEN}$INGESTION_URL${NC}"
}

upload_snapshot_to_s3() {
    local snapshot_path="$1"
    local snapshot_name=$(basename "$snapshot_path")

    echo -e "${GREEN}[1/3] Uploading snapshot to S3...${NC}"

    aws s3 sync "$snapshot_path" "s3://${S3_BUCKET}/${snapshot_name}/" \
        --region "$AWS_REGION" \
        --quiet

    echo -e "       Uploaded to s3://${S3_BUCKET}/${snapshot_name}/"
}

migrate_weaviate_objects() {
    local snapshot_path="$1"
    local objects_file="$snapshot_path/weaviate/objects.json"

    if [ ! -f "$objects_file" ]; then
        echo -e "${YELLOW}       No Weaviate objects file found, skipping...${NC}"
        return
    fi

    echo -e "${GREEN}[2/3] Migrating Weaviate objects via Ingestion API...${NC}"

    local total=$(jq '.objects | length' "$objects_file")
    local count=0
    local success=0
    local failed=0

    # Process each object
    jq -c '.objects[]' "$objects_file" | while read obj; do
        count=$((count + 1))

        # Extract fields from Weaviate object
        local memento_id=$(echo "$obj" | jq -r '.id // empty')
        local content_raw=$(echo "$obj" | jq -r '.properties.contentRaw // empty')
        local agent_id=$(echo "$obj" | jq -r '.properties.agentId // "migrated"')
        local source_system=$(echo "$obj" | jq -r '.properties.sourceSystem // "MIGRATION"')
        local content_type=$(echo "$obj" | jq -r '.properties.contentType // "TEXT"')
        local timestamp=$(echo "$obj" | jq -r '.properties.creationTimestamp // empty')

        # Skip if no content
        if [ -z "$content_raw" ] || [ "$content_raw" == "null" ]; then
            echo -e "       [$count/$total] Skipping empty object $memento_id"
            continue
        fi

        # Create ingestion request
        local payload=$(jq -n \
            --arg aid "$agent_id" \
            --arg src "$source_system" \
            --arg sid "migration-$memento_id" \
            --arg ct "$content_type" \
            --arg cr "$content_raw" \
            --arg ts "$timestamp" \
            '{
                agentId: $aid,
                sourceSystem: $src,
                sourceIdentifier: $sid,
                contentType: $ct,
                contentRaw: $cr,
                eventTimestamp: $ts,
                metadata: {migrated: true, originalId: $sid}
            }')

        # Send to ingestion API
        response=$(curl -sf -X POST "$INGESTION_URL" \
            -H "Content-Type: application/json" \
            -d "$payload" 2>/dev/null || echo "FAILED")

        if [ "$response" != "FAILED" ]; then
            success=$((success + 1))
            echo -e "       [$count/$total] Migrated: $memento_id"
        else
            failed=$((failed + 1))
            echo -e "       [$count/$total] ${RED}Failed: $memento_id${NC}"
        fi

        # Small delay to not overwhelm the service
        sleep 0.1
    done

    echo -e "       Migration complete: $success succeeded, $failed failed"
}

migrate_mongodb() {
    local snapshot_path="$1"
    local mongo_dir="$snapshot_path/mongodb"

    if [ ! -d "$mongo_dir" ]; then
        echo -e "${YELLOW}       No MongoDB dump found, skipping...${NC}"
        return
    fi

    echo -e "${GREEN}[3/3] MongoDB migration info...${NC}"
    echo -e "       ${YELLOW}Note: DocumentDB restore requires manual steps:${NC}"
    echo -e "       1. Upload dump to EC2 instance in the VPC"
    echo -e "       2. Run mongorestore with DocumentDB connection string"
    echo -e "       3. Or use Weaviate migration above (memories re-embedded)"
    echo ""
    echo -e "       MongoDB dump location: s3://${S3_BUCKET}/${SNAPSHOT_NAME}/mongodb/"
    echo -e "       DocumentDB endpoint: $DOCDB_ENDPOINT"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --stack-name)
            STACK_NAME="$2"
            shift 2
            ;;
        --snapshot)
            SNAPSHOT_NAME="$2"
            shift 2
            ;;
        --region)
            AWS_REGION="$2"
            shift 2
            ;;
        --list-snapshots)
            list_snapshots
            exit 0
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            exit 1
            ;;
    esac
done

# Validate required args
if [ -z "$STACK_NAME" ]; then
    echo -e "${RED}Error: --stack-name is required${NC}"
    usage
    exit 1
fi

# Get latest snapshot if not specified
if [ -z "$SNAPSHOT_NAME" ]; then
    SNAPSHOT_NAME=$(get_latest_snapshot)
    if [ -z "$SNAPSHOT_NAME" ]; then
        echo -e "${RED}Error: No snapshots found in $SNAPSHOTS_DIR${NC}"
        exit 1
    fi
    echo -e "${CYAN}Using latest snapshot: ${YELLOW}$SNAPSHOT_NAME${NC}"
fi

SNAPSHOT_PATH="${SNAPSHOTS_DIR}/${SNAPSHOT_NAME}"

if [ ! -d "$SNAPSHOT_PATH" ]; then
    echo -e "${RED}Error: Snapshot not found: $SNAPSHOT_PATH${NC}"
    list_snapshots
    exit 1
fi

echo ""
echo -e "${GREEN}=== MemoRable Memory Migration ===${NC}"
echo -e "Stack: ${YELLOW}$STACK_NAME${NC}"
echo -e "Snapshot: ${YELLOW}$SNAPSHOT_NAME${NC}"
echo -e "Region: ${YELLOW}$AWS_REGION${NC}"
echo ""

# Get stack outputs
get_stack_outputs
echo ""

# Confirm before proceeding
echo -e "${YELLOW}This will migrate memories from local snapshot to AWS.${NC}"
echo -e "Press Enter to continue, Ctrl+C to cancel..."
read

# Run migration steps
upload_snapshot_to_s3 "$SNAPSHOT_PATH"
migrate_weaviate_objects "$SNAPSHOT_PATH"
migrate_mongodb "$SNAPSHOT_PATH"

echo ""
echo -e "${GREEN}=== Migration Complete ===${NC}"
echo -e "Snapshot uploaded to: s3://${S3_BUCKET}/${SNAPSHOT_NAME}/"
echo -e "Memories accessible at: $INGESTION_URL"
echo ""
echo -e "${CYAN}Your memories now travel with you.${NC}"
echo ""
