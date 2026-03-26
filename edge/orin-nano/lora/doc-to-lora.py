#!/usr/bin/env python3
"""
doc-to-lora.py — Fine-tune Gemma 2 2B on MemoRable project knowledge.

Reads project docs, memory patterns, architecture specs, and Alan's
preferences to create a LoRA adapter that makes the on-device model
think natively in MemoRable concepts.

Designed to run on:
  - Orin Nano 8GB (slow but possible with QLoRA)
  - Any CUDA machine (faster, recommended for iteration)
  - Google Colab free tier (T4 GPU, plenty for 2B + QLoRA)

Output: LoRA adapter files ready for Ollama Modelfile import.

Dependencies:
  pip install unsloth[colab-new] datasets transformers trl

Usage:
  python doc-to-lora.py --docs-dir ../../docs --output ./memorable-adapter
  python doc-to-lora.py --docs-dir ../../docs --output ./memorable-adapter --device orin-nano
"""

import argparse
import json
import os
import sys
from pathlib import Path


def collect_training_docs(docs_dir: str, src_dir: str | None = None) -> list[dict]:
    """
    Collect and structure training data from project sources.

    Sources (priority order):
    1. docs/           — architecture, specs, research
    2. CLAUDE.md       — project rules, Alan's preferences, philosophy
    3. src/ key files  — salience calculator, MCP tools, open loop tracker
    4. .env.example    — config knowledge
    """
    samples = []

    project_root = Path(docs_dir).parent
    if src_dir is None:
        src_dir = project_root / "src"

    # ─── Project docs ─────────────────────────────────────────────
    docs_path = Path(docs_dir)
    if docs_path.exists():
        for md_file in sorted(docs_path.rglob("*.md")):
            content = md_file.read_text(encoding="utf-8", errors="replace")
            if len(content.strip()) < 100:
                continue

            # Create Q&A pairs from doc sections
            sections = split_into_sections(content)
            for title, body in sections:
                if len(body.strip()) < 50:
                    continue
                samples.append({
                    "instruction": f"Explain the MemoRable concept: {title}",
                    "input": "",
                    "output": body.strip(),
                    "source": str(md_file.relative_to(project_root)),
                })

    # ─── CLAUDE.md — the rules ────────────────────────────────────
    claude_md = project_root / "CLAUDE.md"
    if claude_md.exists():
        content = claude_md.read_text(encoding="utf-8", errors="replace")
        samples.append({
            "instruction": "What are the core rules and philosophy of the MemoRable project?",
            "input": "",
            "output": content,
            "source": "CLAUDE.md",
        })

        # Extract Alan's critical facts as separate training samples
        samples.append({
            "instruction": "What are important things to know about Alan, the creator of MemoRable?",
            "input": "",
            "output": extract_section(content, "Alan - Critical Facts"),
            "source": "CLAUDE.md",
        })

        samples.append({
            "instruction": "What is the three-pillar philosophy of MemoRable?",
            "input": "",
            "output": extract_section(content, "Core Philosophy"),
            "source": "CLAUDE.md",
        })

    # ─── Key source files (architecture knowledge) ────────────────
    key_files = [
        "services/salience_service/salience_calculator.ts",
        "services/salience_service/open_loop_tracker.ts",
        "services/salience_service/feature_extractor.ts",
        "services/mcp_server/index.ts",
    ]

    src_path = Path(src_dir)
    for rel_path in key_files:
        fpath = src_path / rel_path
        if fpath.exists():
            content = fpath.read_text(encoding="utf-8", errors="replace")
            samples.append({
                "instruction": f"How does MemoRable implement {fpath.stem.replace('_', ' ')}?",
                "input": "",
                "output": content[:8000],  # Truncate long files
                "source": f"src/{rel_path}",
            })

    print(f"Collected {len(samples)} training samples from project sources")
    return samples


def split_into_sections(markdown: str) -> list[tuple[str, str]]:
    """Split markdown into (heading, body) pairs."""
    sections = []
    current_title = "Introduction"
    current_body = []

    for line in markdown.split("\n"):
        if line.startswith("#"):
            if current_body:
                sections.append((current_title, "\n".join(current_body)))
            current_title = line.lstrip("#").strip()
            current_body = []
        else:
            current_body.append(line)

    if current_body:
        sections.append((current_title, "\n".join(current_body)))

    return sections


def extract_section(content: str, heading: str) -> str:
    """Extract a specific section from markdown by heading."""
    lines = content.split("\n")
    capturing = False
    captured = []
    heading_level = 0

    for line in lines:
        if heading.lower() in line.lower() and line.startswith("#"):
            capturing = True
            heading_level = len(line) - len(line.lstrip("#"))
            continue
        elif capturing:
            if line.startswith("#"):
                level = len(line) - len(line.lstrip("#"))
                if level <= heading_level:
                    break
            captured.append(line)

    return "\n".join(captured).strip() or f"(Section '{heading}' not found)"


def format_for_training(samples: list[dict]) -> list[dict]:
    """
    Format samples into Alpaca-style instruction format for Unsloth/TRL.
    """
    formatted = []
    for s in samples:
        text = f"""### Instruction:
{s['instruction']}

### Input:
{s.get('input', '')}

### Response:
{s['output']}"""
        formatted.append({"text": text, "source": s.get("source", "")})

    return formatted


def train_lora(
    samples: list[dict],
    output_dir: str,
    device_profile: str = "default",
):
    """
    Fine-tune Gemma 2 2B with QLoRA using Unsloth.

    Device profiles:
      - orin-nano:  smaller batch, gradient checkpointing, 4-bit quantization
      - default:    standard QLoRA settings for desktop/cloud GPU
      - colab:      optimized for T4 16GB
    """
    try:
        from unsloth import FastLanguageModel
    except ImportError:
        print("ERROR: unsloth not installed.")
        print("  pip install unsloth[colab-new]")
        print("  # or on Orin Nano:")
        print("  pip install unsloth")
        sys.exit(1)

    from datasets import Dataset
    from trl import SFTTrainer
    from transformers import TrainingArguments

    # ─── Device-specific settings ─────────────────────────────────
    profiles = {
        "orin-nano": {
            "max_seq_length": 2048,
            "per_device_batch_size": 1,
            "gradient_accumulation_steps": 8,
            "learning_rate": 2e-4,
            "num_train_epochs": 3,
            "warmup_steps": 10,
            "fp16": True,
            "load_in_4bit": True,
            "lora_r": 16,
            "lora_alpha": 16,
        },
        "default": {
            "max_seq_length": 4096,
            "per_device_batch_size": 2,
            "gradient_accumulation_steps": 4,
            "learning_rate": 2e-4,
            "num_train_epochs": 3,
            "warmup_steps": 20,
            "fp16": True,
            "load_in_4bit": True,
            "lora_r": 32,
            "lora_alpha": 32,
        },
        "colab": {
            "max_seq_length": 4096,
            "per_device_batch_size": 2,
            "gradient_accumulation_steps": 4,
            "learning_rate": 2e-4,
            "num_train_epochs": 3,
            "warmup_steps": 20,
            "fp16": True,
            "load_in_4bit": True,
            "lora_r": 32,
            "lora_alpha": 32,
        },
    }

    cfg = profiles.get(device_profile, profiles["default"])
    print(f"Training profile: {device_profile}")
    print(f"  LoRA rank: {cfg['lora_r']}, alpha: {cfg['lora_alpha']}")
    print(f"  Batch: {cfg['per_device_batch_size']} x {cfg['gradient_accumulation_steps']} accum")
    print(f"  Epochs: {cfg['num_train_epochs']}")

    # ─── Load base model with QLoRA ───────────────────────────────
    print("Loading Gemma 2 2B with 4-bit quantization...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name="unsloth/gemma-2-2b-bnb-4bit",
        max_seq_length=cfg["max_seq_length"],
        load_in_4bit=cfg["load_in_4bit"],
        dtype=None,  # auto-detect
    )

    # ─── Apply LoRA adapters ──────────────────────────────────────
    model = FastLanguageModel.get_peft_model(
        model,
        r=cfg["lora_r"],
        lora_alpha=cfg["lora_alpha"],
        lora_dropout=0.05,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        bias="none",
        use_gradient_checkpointing="unsloth",
    )

    print(f"LoRA parameters: {model.print_trainable_parameters()}")

    # ─── Prepare dataset ──────────────────────────────────────────
    dataset = Dataset.from_list(samples)
    print(f"Training on {len(dataset)} samples")

    # ─── Train ────────────────────────────────────────────────────
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=cfg["max_seq_length"],
        args=TrainingArguments(
            output_dir=output_dir,
            per_device_train_batch_size=cfg["per_device_batch_size"],
            gradient_accumulation_steps=cfg["gradient_accumulation_steps"],
            learning_rate=cfg["learning_rate"],
            num_train_epochs=cfg["num_train_epochs"],
            warmup_steps=cfg["warmup_steps"],
            fp16=cfg["fp16"],
            logging_steps=5,
            save_strategy="epoch",
            optim="adamw_8bit",
            seed=42,
        ),
    )

    print("Training...")
    trainer.train()

    # ─── Save LoRA adapter ────────────────────────────────────────
    adapter_path = os.path.join(output_dir, "adapter")
    model.save_pretrained(adapter_path)
    tokenizer.save_pretrained(adapter_path)
    print(f"LoRA adapter saved to: {adapter_path}")

    # ─── Export for Ollama (GGUF) ─────────────────────────────────
    print("Exporting merged model to GGUF for Ollama...")
    gguf_path = os.path.join(output_dir, "memorable-gemma2-Q4_K_M.gguf")
    model.save_pretrained_gguf(
        output_dir,
        tokenizer,
        quantization_method="q4_k_m",
    )
    print(f"GGUF exported to: {output_dir}")

    # ─── Generate Ollama Modelfile ────────────────────────────────
    modelfile_path = os.path.join(output_dir, "Modelfile")
    with open(modelfile_path, "w") as f:
        f.write(f"""# MemoRable Gemma 2 — fine-tuned for edge memory system
# Created by doc-to-lora.py from project documentation
#
# Import: ollama create memorable-gemma2 -f Modelfile

FROM {gguf_path}

PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER num_ctx 2048
PARAMETER stop "### Instruction:"
PARAMETER stop "### Input:"

SYSTEM \"\"\"You are MemoRable, an AI memory system for cognitive assistance.
You understand salience scoring, open loop tracking, relationship intelligence,
and predictive memory. You process emotions via Hume.ai integration.
You serve as an edge sensor node, running on battery-powered hardware.
Be concise. Prioritize what matters RIGHT NOW (ATR: Adaptive Temporal Relevance).\"\"\"
""")
    print(f"Ollama Modelfile written to: {modelfile_path}")
    print()
    print("Next steps:")
    print(f"  1. ollama create memorable-gemma2 -f {modelfile_path}")
    print("  2. ollama run memorable-gemma2")
    print("  3. Update .env: OLLAMA_MODEL=memorable-gemma2")


def main():
    parser = argparse.ArgumentParser(
        description="Fine-tune Gemma 2 2B on MemoRable project docs (doc-to-LoRA)"
    )
    parser.add_argument(
        "--docs-dir", default="../../docs",
        help="Path to MemoRable docs/ directory",
    )
    parser.add_argument(
        "--src-dir", default=None,
        help="Path to MemoRable src/ directory (auto-detected from docs-dir)",
    )
    parser.add_argument(
        "--output", default="./memorable-adapter",
        help="Output directory for LoRA adapter and GGUF",
    )
    parser.add_argument(
        "--device", choices=["orin-nano", "default", "colab"],
        default="default",
        help="Device profile for training parameters",
    )
    parser.add_argument(
        "--export-data-only", action="store_true",
        help="Only export training data as JSON, don't train",
    )

    args = parser.parse_args()

    # Resolve paths
    docs_dir = os.path.abspath(args.docs_dir)
    if not os.path.isdir(docs_dir):
        print(f"ERROR: docs dir not found: {docs_dir}")
        sys.exit(1)

    output_dir = os.path.abspath(args.output)
    os.makedirs(output_dir, exist_ok=True)

    # Collect training data
    raw_samples = collect_training_docs(docs_dir, args.src_dir)
    formatted = format_for_training(raw_samples)

    if args.export_data_only:
        data_path = os.path.join(output_dir, "training_data.json")
        with open(data_path, "w") as f:
            json.dump(formatted, f, indent=2)
        print(f"Training data exported to: {data_path} ({len(formatted)} samples)")
        return

    # Train
    train_lora(formatted, output_dir, device_profile=args.device)


if __name__ == "__main__":
    main()
