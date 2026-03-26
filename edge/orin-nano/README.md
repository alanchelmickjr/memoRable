# MemoRable — Orin Nano 8GB Edge Deployment

Battery-powered prototype. Native deployment, no containers.
Hume.ai emotion sensing + MemoRable memory on the edge.

## Hardware

| Spec | Value |
|------|-------|
| Platform | NVIDIA Jetson Orin Nano 8GB |
| CPU | 6-core Arm Cortex-A78AE |
| GPU | 1024 CUDA cores (Ampere) |
| RAM | 8GB unified (LPDDR5, shared CPU/GPU) |
| Storage | NVMe recommended |
| Power | Battery (experimental) |

## Requirements

- **JetPack 6.x** (L4T / Ubuntu 22.04 base)
- **CUDA 12.x** (included with JetPack)
- Network access for Hume.ai WebSocket streaming

## Memory Budget (8GB Unified — GPU shared with everything)

```
OS + JetPack/CUDA runtime:      ~1.5 GB
OAK-D DepthAI pipeline:         ~0.3 GB  (depth camera, spatial AI)
AEC audio processing:            ~0.1 GB  (echo cancellation)
Gemma 2 2B Q4 + LoRA:           ~1.5 GB  (doc-to-lora fine-tuned)
Hume preprocessing (face/voice):  ~0.3 GB  (emotion streaming)
MongoDB (WiredTiger cache):       0.5 GB
Redis:                            0.25 GB
Node.js (MemoRable MCP):         0.5 GB
────────────────────────────────────────
Total:                           ~5.0 GB
Headroom:                        ~3.0 GB
```

Every service has hard memory limits via systemd cgroups and config.
If the device gets interrupted (battery), services restart cleanly.
Do NOT add more GPU consumers without recalculating the budget.

## Setup

```bash
# Flash JetPack 6.x to the Orin Nano first, then:
git clone <repo-url> ~/memorable
cd ~/memorable

# Set your Hume API key
export HUME_API_KEY=your_key_here

# Run setup (installs Node, MongoDB, Redis, systemd units)
sudo bash edge/orin-nano/setup.sh
```

## What Gets Installed

| Component | How | Memory Limit |
|-----------|-----|-------------|
| Node.js 23 | apt (nodesource) | 512MB heap (768MB cgroup) |
| MongoDB 7 | apt (mongodb.org) | 512MB WiredTiger cache |
| Redis | apt | 256MB maxmemory |
| MemoRable MCP | systemd service | cgroup-enforced |
| Ollama + Gemma 2 | ollama create | ~1.5GB GPU (Q4 + LoRA) |
| OAK-D DepthAI | pip (depthai) | ~300MB GPU |
| AEC | system lib | ~100MB |

All run as systemd services with `Restart=on-failure`. No Docker.

## Services

```bash
# Check status
systemctl status memorable-mcp
systemctl status mongod
systemctl status redis-server

# View logs
journalctl -u memorable-mcp -f

# Restart after config change
sudo systemctl restart memorable-mcp
```

## Hume.ai Emotion Pipeline

The edge demo's star feature. Hume streams emotion data from:
- **Camera** — facial expression analysis
- **Microphone** — vocal prosody (tone, pitch, rhythm)
- **Text** — language sentiment

All via WebSocket (`wss://api.hume.ai/v0/stream/models`).
Confidence thresholds are relaxed slightly for edge noise.
Chunk durations shortened for battery (3s vs 5s default).

The Orin Nano's GPU handles local preprocessing (face detection,
audio feature extraction) before streaming to Hume, reducing
bandwidth and latency.

## Power Management

The `.env.orin-nano` includes battery-aware settings:
- `EDGE_BATTERY_AWARE=true`
- `EDGE_LOW_POWER_THRESHOLD=20`

When battery drops below threshold, the system should:
1. Reduce sensor polling frequency
2. Skip non-critical background processing
3. Flush any pending memory writes to MongoDB
4. Keep only essential MCP tools responsive

> Power management hooks are TODO — the env vars are ready,
> the application code needs to read and act on them.

## Monitoring

```bash
# Memory usage by service
systemctl status memorable-mcp | grep Memory
ps aux --sort=-%mem | head -10

# GPU usage
tegrastats

# Battery (if exposed via sysfs)
cat /sys/class/power_supply/*/capacity 2>/dev/null

# MongoDB memory
mongosh --eval "db.serverStatus().wiredTiger.cache"

# Redis memory
redis-cli info memory | grep used_memory_human
```

## Updating

```bash
cd ~/memorable
git pull origin edge/orin-nano-8gb
sudo cp -r src/ /opt/memorable/src/
sudo systemctl restart memorable-mcp
```

## Differences from Cloud Deployment

| | Cloud (EC2) | Edge (Orin Nano) |
|---|---|---|
| Deployment | Docker on EC2 | Native systemd |
| Memory | 8-16GB dedicated | 8GB shared w/ GPU |
| Storage | EBS | NVMe/SD |
| Power | Unlimited | Battery |
| Network | Always-on | Intermittent |
| Sensors | None | Camera, mic, GPS |
| Hume | Optional | Primary feature |
| MongoDB | Atlas or local | Local only |
| LLM | Bedrock/API | Gemma 2 2B + LoRA (on-device) |
| Camera | None | OAK-D depth (DepthAI) |
| Audio | None | Mic + AEC |
