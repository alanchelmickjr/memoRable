# doc-to-LoRA — Fine-tune Gemma 2 for MemoRable Edge

Train a LoRA adapter on MemoRable's own docs, architecture, and memory patterns.
The result is a small model that thinks natively in MemoRable concepts — salience,
open loops, relationships, ATR — running on the Orin Nano's GPU.

## Why LoRA, not prompt stuffing

The Orin Nano GPU budget is razor thin:
- OAK-D depth camera pipeline (DepthAI/OpenVINO)
- AEC (acoustic echo cancellation)
- Gemma 2 2B inference
- Hume WebSocket preprocessing

There's no room for long system prompts eating context window.
A LoRA adapter bakes domain knowledge into the weights — zero
runtime overhead vs a bigger prompt.

## GPU Memory Reality (8GB unified)

```
OS + JetPack/CUDA runtime:     ~1.5 GB
OAK-D DepthAI pipeline:        ~0.3 GB
AEC audio processing:           ~0.1 GB
Gemma 2 2B Q4 + LoRA:          ~1.5 GB
Hume preprocessing (face/voice): ~0.3 GB
MongoDB WiredTiger cache:        0.5 GB
Redis:                           0.25 GB
Node.js (MemoRable MCP):        0.5 GB
──────────────────────────────────────
Total:                          ~5.0 GB
Headroom:                       ~3.0 GB
```

Headroom is for spikes, OS buffers, and keeping the system
from OOM-killing under load. Do NOT add more GPU consumers.

## Quick Start

### Option 1: Train on a bigger machine, deploy to Nano

```bash
# On your dev machine or Colab:
pip install "unsloth[colab-new]" datasets transformers trl

# Export training data first (no GPU needed)
python doc-to-lora.py --docs-dir ../../docs --export-data-only --output ./memorable-adapter

# Train (needs GPU — T4 or better, 5-15 min)
python doc-to-lora.py --docs-dir ../../docs --output ./memorable-adapter --device default

# Copy adapter to Nano
scp -r ./memorable-adapter/Modelfile nano:/opt/memorable/lora/
scp -r ./memorable-adapter/*.gguf nano:/opt/memorable/lora/

# On the Nano:
ollama create memorable-gemma2 -f /opt/memorable/lora/Modelfile
```

### Option 2: Train directly on the Nano (slow but works)

```bash
pip install unsloth datasets transformers trl
python doc-to-lora.py --docs-dir /opt/memorable/docs --output /opt/memorable/lora/memorable-adapter --device orin-nano
```

Expect ~30-60 min on Orin Nano with QLoRA 4-bit and batch size 1.

### Option 3: Google Colab (free, T4 GPU)

Upload `doc-to-lora.py` and your `docs/` directory to Colab, then:

```python
!pip install "unsloth[colab-new]" datasets transformers trl
!python doc-to-lora.py --docs-dir ./docs --output ./memorable-adapter --device colab
```

Download the GGUF and Modelfile, transfer to Nano.

## Training Data Sources

The script automatically collects from:

| Source | What it learns |
|--------|---------------|
| `docs/` | Architecture, specs, research papers, design decisions |
| `CLAUDE.md` | Project rules, Alan's preferences, three pillars, philosophy |
| `src/` key files | Salience calculator, open loop tracker, MCP tools, feature extractor |

Output format: Alpaca-style instruction/response pairs.

## Updating the Adapter

When docs or architecture change significantly:

```bash
# Re-run training (incremental knowledge)
python doc-to-lora.py --docs-dir ../../docs --output ./memorable-adapter

# Re-create Ollama model
ollama create memorable-gemma2 -f ./memorable-adapter/Modelfile

# Restart MCP service
sudo systemctl restart memorable-mcp
```

## What the Model Knows After Training

- Salience scoring: emotion 30%, novelty 20%, relevance 20%, social 15%, consequential 15%
- Open loop tracking and commitment management
- Relationship health and entity model
- ATR (Adaptive Temporal Relevance) — what matters right now
- The three pillars: temporal control, individual privacy, relevance
- Alan's critical facts and communication preferences
- MCP tool semantics and when to use each
- Edge deployment constraints and battery awareness
