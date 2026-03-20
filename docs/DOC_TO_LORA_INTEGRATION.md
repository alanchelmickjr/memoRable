# Doc-to-LoRA Integration

## Better Than Memory. Better Than Prompt Engineering.

**MemoRable + doc-to-lora = real-time memory internalization.**

Prompt engineering stuffs context into a shrinking window. RAG retrieves chunks and hopes for the best. Doc-to-lora does something different: it **generates LoRA weights from documents in real-time**, embedding knowledge directly into model parameters. No context window limits. No retrieval latency. The model *knows* it.

## Upstream

This project integrates [alanchelmickjr/doc-to-lora](https://github.com/alanchelmickjr/doc-to-lora) as a git submodule at `vendors/doc-to-lora/`.

```bash
# Initialize after clone
git submodule init && git submodule update

# Stay fresh with upstream
git submodule update --remote vendors/doc-to-lora
```

## How It Works

```
Document → Context Encoder → Perceiver Aggregator → HyperLoRA → LoRA Weights
                                                                      │
                                                                      ▼
                                                              Base Model (Gemma 2)
                                                              now "knows" the document
```

1. **Internalize**: Feed a document to the hypernetwork. It generates rank-8 LoRA weights (~few MB) in seconds.
2. **Store**: Save the weights to S3. Tiny files. Pennies to store.
3. **Apply**: Load weights onto base model at inference time. The model now has the knowledge baked in.
4. **Reset**: Clear weights. Back to base. No residue.

## Architecture (Cloud Only)

```
┌──────────────────────────┐         ┌──────────────────────────┐
│  AWS EC2 t4g.micro       │         │  GPU Instance             │
│  ────────────────────    │  HTTP   │  ──────────────────────  │
│  MCP Server :8080        │────────▶│  LoRA Service :8090      │
│  Redis (context)         │         │  Gemma 2 2B + HyperLoRA  │
│  MongoDB Atlas ←─────────┼─────────┼──── shared DB            │
└──────────────────────────┘         └──────────┬───────────────┘
                                                │
                                          S3 (LoRA weights)
```

**GPU instance runs on-demand only.** Spins up to internalize a document, saves weights, shuts down. Minutes of runtime, not hours.

## GPU Options

| Provider | Instance | GPU | VRAM | Cost | Notes |
|----------|----------|-----|------|------|-------|
| **Nebius** | GPU instance | Various | 16-80GB | Credits available | Cheapest GPU cloud |
| **AWS Spot** | g4dn.xlarge | T4 | 16GB | ~$0.16/hr | Apply for AWS Activate credits |
| **AWS Spot** | g5.xlarge | A10G | 24GB | ~$0.40/hr | Fits Gemma 2 9B int4 |

**Start with Gemma 2 2B** — already has a trained hypernetwork checkpoint from doc-to-lora. Graduate to 9B after training that hypernetwork.

## API Surface

The LoRA service exposes three endpoints:

### `POST /internalize`
```json
{
  "document": "The full text of the document to internalize",
  "model": "gemma-2-2b"
}
```
Returns: `{ "weights_key": "s3://memorable-lora/abc123.pt", "status": "ok" }`

### `POST /generate`
```json
{
  "prompt": "What does the document say about X?",
  "weights_key": "s3://memorable-lora/abc123.pt"
}
```
Returns: `{ "response": "The document states that..." }`

### `POST /reset`
Clears loaded weights. Returns to base model.

## Integration with MCP

New MCP tool: `internalize_document`

```
User: "Internalize this research paper about attention mechanisms"
→ MCP server sends document to GPU LoRA service
→ Weights generated and stored in S3
→ Linked to memory in MongoDB with salience score
→ Future recalls can load these weights for deep understanding
```

## The Pipeline

```
MemoRable Ingestion Pipeline (existing)
    │
    ├─ Feature Extraction (salience scoring)
    ├─ Embedding Generation (vector search)
    ├─ Open Loop Detection (commitments)
    └─ NEW: LoRA Internalization (deep knowledge)
              │
              ├─ Send document to GPU service
              ├─ Receive LoRA weights
              ├─ Store weights (S3)
              └─ Link to memory record (MongoDB)
```

**Internalize is GPU burst. Recall is CPU lookup.** The expensive part (weight generation) happens once. Applying pre-computed weights is cheap.

## Model Strategy

| Model | Size | Use Case |
|-------|------|----------|
| **Gemma 2 2B** | ~4GB | Default. Has trained checkpoint. Fits on T4. |
| **Gemma 2 9B** | ~18GB (bf16) / ~9GB (int4) | Cloud heavy. Train hypernetwork on DGX/Nebius. |
| **Gemma 2 27B** | ~54GB (bf16) | Future. Same adapter architecture. |

All Gemma 2 family — same LoRA architecture, same weight shapes, same tooling.

## Staying Fresh

```bash
# Update to latest upstream
cd vendors/doc-to-lora
git pull origin main
cd ../..
git add vendors/doc-to-lora
git commit -m "chore: update doc-to-lora submodule"
```

Or from project root:
```bash
git submodule update --remote vendors/doc-to-lora
```
