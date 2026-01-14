#!/bin/bash
#
# MemoRable Time Machine - Snapshot System
# Creates coordinated snapshots of MongoDB + Weaviate state
#
# Usage:
#   ./scripts/snapshot.sh                    # Auto-timestamped snapshot
#   ./scripts/snapshot.sh "wires-connected"  # Named snapshot
#   ./scripts/snapshot.sh --list             # List all snapshots
#   ./scripts/snapshot.sh --restore <name>   # Restore to snapshot
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SNAPSHOTS_DIR="${PROJECT_DIR}/snapshots"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Ensure snapshots directory exists
mkdir -p "$SNAPSHOTS_DIR"

# List snapshots
list_snapshots() {
    echo -e "${GREEN}Available snapshots:${NC}"
    echo ""
    if [ -d "$SNAPSHOTS_DIR" ] && [ "$(ls -A $SNAPSHOTS_DIR 2>/dev/null)" ]; then
        for snap in "$SNAPSHOTS_DIR"/*; do
            if [ -d "$snap" ]; then
                name=$(basename "$snap")
                mongo_size=$(du -sh "$snap/mongodb" 2>/dev/null | cut -f1 || echo "missing")
                weaviate_size=$(du -sh "$snap/weaviate" 2>/dev/null | cut -f1 || echo "missing")
                echo -e "  ${YELLOW}$name${NC}"
                echo "    MongoDB: $mongo_size | Weaviate: $weaviate_size"
            fi
        done
    else
        echo "  (no snapshots found)"
    fi
    echo ""
}

# Create snapshot
create_snapshot() {
    local label="$1"
    local timestamp=$(date +"%Y%m%d-%H%M%S")

    if [ -n "$label" ]; then
        local snapshot_name="${timestamp}-${label}"
    else
        snapshot_name="${timestamp}"
    fi

    local snapshot_path="${SNAPSHOTS_DIR}/${snapshot_name}"

    echo -e "${GREEN}Creating snapshot: ${YELLOW}${snapshot_name}${NC}"
    echo ""

    mkdir -p "$snapshot_path"

    # Snapshot MongoDB - get credentials from container env
    echo -e "  ${GREEN}[1/2]${NC} Dumping MongoDB..."
    local mongo_user=$(docker exec memorable_mongo_db printenv MONGO_INITDB_ROOT_USERNAME)
    local mongo_pass=$(docker exec memorable_mongo_db printenv MONGO_INITDB_ROOT_PASSWORD)

    docker exec memorable_mongo_db mongodump \
        --uri="mongodb://${mongo_user}:${mongo_pass}@localhost:27017/memorable?authSource=admin" \
        --out=/tmp/mongodump \
        --quiet 2>/dev/null || docker exec memorable_mongo_db mongodump \
        --uri="mongodb://${mongo_user}:${mongo_pass}@localhost:27017/?authSource=admin" \
        --db=memorable \
        --out=/tmp/mongodump 2>/dev/null

    docker cp memorable_mongo_db:/tmp/mongodump "$snapshot_path/mongodb"
    docker exec memorable_mongo_db rm -rf /tmp/mongodump
    echo -e "       MongoDB dumped: $(du -sh "$snapshot_path/mongodb" | cut -f1)"

    # Snapshot Weaviate - export all objects with vectors
    echo -e "  ${GREEN}[2/2]${NC} Backing up Weaviate..."
    mkdir -p "$snapshot_path/weaviate"

    # Export schema
    curl -sf "http://localhost:8080/v1/schema" > "$snapshot_path/weaviate/schema.json"

    # Export all objects with vectors
    curl -sf "http://localhost:8080/v1/objects?class=MemoryMemento&limit=10000&include=vector" > "$snapshot_path/weaviate/objects.json"

    local obj_count=$(jq '.objects | length' "$snapshot_path/weaviate/objects.json" 2>/dev/null || echo "0")
    echo -e "       Weaviate exported: ${obj_count} objects ($(du -sh "$snapshot_path/weaviate" | cut -f1))"

    # Write metadata
    cat > "$snapshot_path/metadata.json" << EOF
{
    "name": "${snapshot_name}",
    "created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "label": "${label}",
    "mongodb_collections": ["memory_mementos"],
    "weaviate_classes": ["MemoryMemento"]
}
EOF

    echo ""
    echo -e "${GREEN}Snapshot created: ${YELLOW}${snapshot_name}${NC}"
    echo -e "Location: ${snapshot_path}"
    echo ""
}

# Restore snapshot
restore_snapshot() {
    local snapshot_name="$1"
    local snapshot_path="${SNAPSHOTS_DIR}/${snapshot_name}"

    if [ ! -d "$snapshot_path" ]; then
        echo -e "${RED}Snapshot not found: ${snapshot_name}${NC}"
        list_snapshots
        exit 1
    fi

    echo -e "${YELLOW}WARNING: This will replace current memories with snapshot: ${snapshot_name}${NC}"
    echo -e "Press Ctrl+C to cancel, or Enter to continue..."
    read

    echo -e "${GREEN}Restoring snapshot: ${YELLOW}${snapshot_name}${NC}"
    echo ""

    # Restore MongoDB
    echo -e "  ${GREEN}[1/2]${NC} Restoring MongoDB..."
    local mongo_user=$(docker exec memorable_mongo_db printenv MONGO_INITDB_ROOT_USERNAME)
    local mongo_pass=$(docker exec memorable_mongo_db printenv MONGO_INITDB_ROOT_PASSWORD)

    docker cp "$snapshot_path/mongodb" memorable_mongo_db:/tmp/mongorestore
    docker exec memorable_mongo_db mongorestore \
        --uri="mongodb://${mongo_user}:${mongo_pass}@localhost:27017/?authSource=admin" \
        --drop \
        /tmp/mongorestore \
        --quiet 2>/dev/null
    docker exec memorable_mongo_db rm -rf /tmp/mongorestore
    echo -e "       MongoDB restored"

    # Restore Weaviate
    echo -e "  ${GREEN}[2/2]${NC} Restoring Weaviate..."

    if [ -f "$snapshot_path/weaviate/objects.json" ]; then
        # Delete existing objects
        curl -sf -X DELETE "http://localhost:8080/v1/schema/MemoryMemento" > /dev/null 2>&1 || true

        # Recreate schema
        curl -sf -X POST "http://localhost:8080/v1/schema" \
            -H "Content-Type: application/json" \
            -d '{
                "class": "MemoryMemento",
                "vectorizer": "none",
                "properties": [
                    {"name": "mementoId", "dataType": ["text"]},
                    {"name": "agentId", "dataType": ["text"]},
                    {"name": "contentRaw", "dataType": ["text"]},
                    {"name": "contentProcessed", "dataType": ["text"]},
                    {"name": "contentType", "dataType": ["text"]},
                    {"name": "sourceSystem", "dataType": ["text"]},
                    {"name": "creationTimestamp", "dataType": ["text"]},
                    {"name": "salienceScore", "dataType": ["number"]},
                    {"name": "tags", "dataType": ["text[]"]}
                ]
            }' > /dev/null

        # Import objects
        jq -c '.objects[]' "$snapshot_path/weaviate/objects.json" | while read obj; do
            curl -sf -X POST "http://localhost:8080/v1/objects" \
                -H "Content-Type: application/json" \
                -d "$obj" > /dev/null
        done
        echo -e "       Weaviate restored from export"
    else
        echo -e "       ${YELLOW}Weaviate backup format not supported for restore yet${NC}"
    fi

    echo ""
    echo -e "${GREEN}Snapshot restored: ${YELLOW}${snapshot_name}${NC}"
    echo ""
}

# Main
case "${1:-}" in
    --list|-l)
        list_snapshots
        ;;
    --restore|-r)
        if [ -z "$2" ]; then
            echo -e "${RED}Usage: $0 --restore <snapshot-name>${NC}"
            list_snapshots
            exit 1
        fi
        restore_snapshot "$2"
        ;;
    --help|-h)
        echo "MemoRable Time Machine - Snapshot System"
        echo ""
        echo "Usage:"
        echo "  $0                     Create timestamped snapshot"
        echo "  $0 \"label\"             Create named snapshot"
        echo "  $0 --list              List all snapshots"
        echo "  $0 --restore <name>    Restore to snapshot"
        echo ""
        ;;
    *)
        create_snapshot "$1"
        ;;
esac
