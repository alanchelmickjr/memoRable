#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# MemoRable — Edge Deploy (Jetson)
# ═══════════════════════════════════════════════════════════════════════
#
# Deploys the Foundry demo to a Jetson device over SSH.
# Clones from GitHub, sets up Python env, installs deps, runs demo.
#
# Usage:
#   ./scripts/deploy-edge.sh HOST [BRANCH]
#
# Examples:
#   ./scripts/deploy-edge.sh robot@192.168.88.158
#   ./scripts/deploy-edge.sh robot@192.168.88.158 claude/foundry-demo
#
# Prerequisites:
#   - sshpass installed (brew install sshpass)
#   - Jetson reachable on local network
#   - HuggingFace token for checkpoint download (set HF_TOKEN env var)
#
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

HOST="${1:?Usage: deploy-edge.sh HOST [BRANCH]}"
BRANCH="${2:-claude/foundry-demo}"
GITHUB_REPO="https://github.com/alanchelmickjr/memoRable.git"
INSTALL_DIR="/mnt/data/foundry"
HF_TOKEN="${HF_TOKEN:-}"
# JetPack 5.x uses system Python 3.8 + NVIDIA's pre-built torch wheel
VENV_DIR="$INSTALL_DIR/venv"
TORCH_WHEEL_URL="https://developer.download.nvidia.com/compute/redist/jp/v512/pytorch/torch-2.1.0a0+41361538.nv23.06-cp38-cp38-linux_aarch64.whl"
SQLITE_URL="https://www.sqlite.org/2024/sqlite-autoconf-3450100.tar.gz"

RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m' BLUE='\033[0;34m' NC='\033[0m'
info()  { echo -e "${BLUE}[edge]${NC} $*"; }
ok()    { echo -e "${GREEN}[edge]${NC} $*"; }
warn()  { echo -e "${YELLOW}[edge]${NC} $*"; }
err()   { echo -e "${RED}[edge]${NC} $*" >&2; }

# ─── Detect SSH auth method ─────────────────────────────────────────
SSH_CMD="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10"
SCP_CMD="scp -o StrictHostKeyChecking=no"

# Try key-based first, fall back to sshpass
if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes "$HOST" true 2>/dev/null; then
    info "Using SSH key auth"
elif command -v sshpass &>/dev/null; then
    read -rsp "[edge] Password for $HOST: " PASS; echo
    SSH_CMD="sshpass -p '$PASS' $SSH_CMD"
    SCP_CMD="sshpass -p '$PASS' $SCP_CMD"
else
    err "No SSH key and sshpass not installed. Install: brew install sshpass"
    exit 1
fi

run_remote() {
    eval "$SSH_CMD $HOST \"$*\""
}

# ─── Preflight ──────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
info "MemoRable — Edge Deploy"
echo "═══════════════════════════════════════════════════════════════"
echo ""

info "Host:     $HOST"
info "Branch:   $BRANCH"
info "Install:  $INSTALL_DIR"
echo ""

info "Checking device..."
DEVICE_INFO=$(run_remote "cat /proc/device-tree/model 2>/dev/null; echo")
MEMORY=$(run_remote "free -h | grep Mem | awk '{print \$2}'")
DISK=$(run_remote "df -h /mnt/data 2>/dev/null | tail -1 | awk '{print \$4}'" || echo "N/A")

ok "Device:  $DEVICE_INFO"
ok "Memory:  $MEMORY"
ok "Disk:    $DISK free on /mnt/data"
echo ""

# ─── Ensure branch is pushed ────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

info "Ensuring branch '$BRANCH' is on GitHub..."
cd "$PROJECT_DIR"
if git rev-parse --verify "$BRANCH" &>/dev/null; then
    if ! git ls-remote --heads origin "$BRANCH" | grep -q "$BRANCH"; then
        info "Pushing $BRANCH to origin..."
        git push -u origin "$BRANCH"
    else
        info "Branch already on origin, pushing latest..."
        git push origin "$BRANCH"
    fi
else
    err "Branch $BRANCH not found locally"
    exit 1
fi
ok "Branch $BRANCH available on GitHub"

# ─── Install Miniforge (conda) if needed ────────────────────────────
info "Setting up Python environment..."

run_remote "
    if [ ! -f $CONDA_DIR/bin/conda ]; then
        echo '[edge] Installing Miniforge...'
        wget -q -O /tmp/miniforge.sh https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-aarch64.sh
        bash /tmp/miniforge.sh -b -p $CONDA_DIR
        rm /tmp/miniforge.sh
        echo '[edge] Miniforge installed'
    else
        echo '[edge] Miniforge already installed'
    fi
"

# ─── Create conda env ───────────────────────────────────────────────
run_remote "
    export PATH=$CONDA_DIR/bin:\$PATH
    if ! conda env list | grep -q $ENV_NAME; then
        echo '[edge] Creating conda env ($ENV_NAME, Python $PYTHON_VER)...'
        conda create -y -n $ENV_NAME python=$PYTHON_VER
        echo '[edge] Conda env created'
    else
        echo '[edge] Conda env $ENV_NAME exists'
    fi
"

# ─── Clone / update repo ────────────────────────────────────────────
info "Cloning repository..."

run_remote "
    if [ -d $INSTALL_DIR/memoRable/.git ]; then
        echo '[edge] Updating existing clone...'
        cd $INSTALL_DIR/memoRable
        git fetch origin
        git checkout $BRANCH
        git pull origin $BRANCH
    else
        echo '[edge] Fresh clone...'
        mkdir -p $INSTALL_DIR
        cd $INSTALL_DIR
        git clone --branch $BRANCH --single-branch $GITHUB_REPO
    fi
    echo '[edge] Repo ready'
"

# ─── Install PyTorch (Jetson wheel) + deps ──────────────────────────
info "Installing dependencies..."

run_remote "
    export PATH=$CONDA_DIR/bin:\$PATH
    eval \"\$(conda shell.bash hook)\"
    conda activate $ENV_NAME

    # PyTorch for Jetson — NVIDIA pre-built wheel (JetPack 5.x, CUDA 11.4)
    if ! python -c 'import torch; print(torch.__version__)' 2>/dev/null; then
        echo '[edge] Installing PyTorch for Jetson...'
        pip install --no-cache-dir \
            torch torchvision \
            --index-url https://pypi.jetson-ai-lab.dev
        echo '[edge] PyTorch installed'
    else
        echo \"[edge] PyTorch already installed: \$(python -c 'import torch; print(torch.__version__)')\"
    fi

    # Install demo requirements
    echo '[edge] Installing demo deps...'
    cd $INSTALL_DIR/memoRable
    pip install --no-cache-dir -r demo/foundry/requirements.txt
    pip install --no-cache-dir ngrok  # for public access

    echo '[edge] All deps installed'
"

# ─── Download hypernetwork checkpoint ────────────────────────────────
info "Checking hypernetwork checkpoint..."

HF_ARG=""
if [ -n "$HF_TOKEN" ]; then
    HF_ARG="--token $HF_TOKEN"
fi

run_remote "
    export PATH=$CONDA_DIR/bin:\$PATH
    eval \"\$(conda shell.bash hook)\"
    conda activate $ENV_NAME

    CKPT_DIR=$INSTALL_DIR/memoRable/vendors/doc-to-lora/trained_t2l/gemma_2b_t2l
    if [ -d \"\$CKPT_DIR\" ] && ls \"\$CKPT_DIR\"/*.bin 2>/dev/null | grep -q .; then
        echo '[edge] Checkpoint already downloaded'
    else
        echo '[edge] Downloading hypernetwork checkpoint from HuggingFace...'
        pip install -q huggingface-hub
        mkdir -p $INSTALL_DIR/memoRable/vendors/doc-to-lora/trained_t2l
        huggingface-cli download SakanaAI/doc-to-lora \
            --local-dir $INSTALL_DIR/memoRable/vendors/doc-to-lora/trained_d2l \
            $HF_ARG
        echo '[edge] Checkpoint downloaded'
    fi
"

# ─── Launch ──────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
ok "Deployment complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
ok "To run the demo:"
echo ""
echo "  $SSH_CMD $HOST"
echo "  export PATH=$CONDA_DIR/bin:\$PATH"
echo "  conda activate $ENV_NAME"
echo "  cd $INSTALL_DIR/memoRable/demo/foundry"
echo "  python app.py"
echo ""
ok "Demo will be at http://\$(echo $HOST | cut -d@ -f2):7860"
echo ""
ok "For public access (ngrok):"
echo "  ngrok http 7860"
echo ""
echo "═══════════════════════════════════════════════════════════════"
