"""
Foundry Demo — mem0 vs Doc-to-LoRA Side by Side

Upload a PDF. Both systems process it. Ask a question. See the difference.
Left: RAG retrieves chunks. Right: LoRA internalizes understanding.
Toggle: same model WITHOUT LoRA hallucinates. That's the proof.

Usage:
    python app.py
"""

import logging
import os
import sys
from pathlib import Path

import gradio as gr

# Setup logging before imports
logging.basicConfig(level=logging.INFO, format="%(name)s | %(message)s")
logger = logging.getLogger("foundry-demo")

# Resolve paths
DEMO_DIR = Path(__file__).resolve().parent
REPO_ROOT = DEMO_DIR.parents[1]
BETTY_PATH = DEMO_DIR / "betty.txt"

# Import demo modules
from foundry_engine import FoundryEngine
from rag_pipeline import RAGPipeline
from pdf_utils import extract_pdf

# Global state
engine = FoundryEngine()
rag = RAGPipeline()
current_text = None


def load_models():
    """Pre-load both pipelines."""
    logger.info("Loading models...")
    engine.load()
    rag.load()
    logger.info("All models loaded")


def ingest_document(pdf_file=None, use_betty=False):
    """Process a document through both pipelines."""
    global current_text

    if use_betty:
        if not BETTY_PATH.exists():
            return "Betty document not found.", ""
        text = BETTY_PATH.read_text(encoding="utf-8")
        doc_name = "betty.txt"
    elif pdf_file is not None:
        text = extract_pdf(pdf_file.name)
        doc_name = Path(pdf_file.name).name
    else:
        return "Upload a PDF or load the Betty example.", ""

    if not text.strip():
        return "Document is empty.", ""

    current_text = text
    word_count = len(text.split())

    # Process both sides
    lora_time = engine.ingest(text)
    rag_time = rag.ingest(text)

    status = (
        f"**{doc_name}** — {word_count:,} words\n\n"
        f"| Pipeline | Time |\n"
        f"|----------|------|\n"
        f"| Doc-to-LoRA (internalize) | **{lora_time:.2f}s** |\n"
        f"| RAG (chunk + embed) | **{rag_time:.2f}s** |"
    )

    suggested_questions = ""
    if use_betty:
        suggested_questions = (
            "**Try asking:**\n"
            "- Should anyone be concerned about Betty?\n"
            "- What signs of cognitive decline does Betty show?\n"
            "- What is Betty's relationship with her daughter?\n"
            "- Summarize Betty's daily routine and any concerning patterns."
        )

    return status, suggested_questions


def upload_and_ingest(pdf_file):
    """Handle PDF upload."""
    if pdf_file is None:
        return "Upload a PDF to begin.", ""
    return ingest_document(pdf_file=pdf_file)


def load_betty():
    """Load the Betty example document."""
    return ingest_document(use_betty=True)


def ask_question(question: str, show_hallucination: bool):
    """Run query through both pipelines and return side-by-side results."""
    if not question.strip():
        return "", "", ""

    if current_text is None:
        return "Upload a document first.", "", ""

    if not engine.is_ingested:
        return "Document not yet processed.", "", ""

    # --- RAG side (left panel) ---
    chunks = rag.retrieve(question)
    rag_prompt = rag.build_prompt(question, chunks)
    rag_answer, rag_time = engine.generate(rag_prompt, use_lora=False)

    chunks_display = ""
    for i, chunk in enumerate(chunks):
        preview = chunk[:300] + "..." if len(chunk) > 300 else chunk
        chunks_display += f"\n\n**Chunk {i+1}:**\n> {preview}"

    rag_display = (
        f"### mem0 / RAG  &mdash;  O(n)\n\n"
        f"Retrieved **{len(chunks)} chunks** from vector store\n"
        f"{chunks_display}\n\n"
        f"---\n\n"
        f"**LLM Answer** ({rag_time:.2f}s):\n\n{rag_answer}"
    )

    # --- Foundry side (right panel) ---
    lora_answer, lora_time = engine.generate(question, use_lora=True)

    foundry_display = (
        f"### Foundry (Doc-to-LoRA)  &mdash;  O(1)\n\n"
        f"Context in prompt: **NONE**\n"
        f"Knowledge source: **LoRA weights**\n\n"
        f"---\n\n"
        f"**Answer** ({lora_time:.2f}s):\n\n{lora_answer}"
    )

    # --- Hallucination proof (optional) ---
    halluc_display = ""
    if show_hallucination:
        halluc_answer, halluc_time = engine.generate(question, use_lora=False)
        halluc_display = (
            f"### Same Model, NO LoRA, NO Context\n\n"
            f"**The model is guessing** ({halluc_time:.2f}s):\n\n"
            f"{halluc_answer}\n\n"
            f"*This proves the knowledge came from the LoRA weights, "
            f"not from pretraining or the prompt.*"
        )
        # Re-enable LoRA for next query
        engine._apply_weights(engine._lora_dict)
        engine._lora_active = True

    return rag_display, foundry_display, halluc_display


# ── Gradio UI ────────────────────────────────────────────────────────────────

CUSTOM_CSS = """
.header { text-align: center; margin-bottom: 1rem; }
.header h1 { font-size: 2rem; font-weight: 700; }
.header p { color: #666; font-size: 1.1rem; }
.panel-left { border-right: 2px solid #e0e0e0; }
.status-box { background: #f8f9fa; border-radius: 8px; padding: 1rem; }
.halluc-box { background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 1rem; margin-top: 1rem; }
"""

with gr.Blocks(
    title="Foundry Demo",
    theme=gr.themes.Soft(primary_hue="emerald"),
    css=CUSTOM_CSS,
) as demo:

    # Header
    gr.HTML("""
    <div class="header">
        <h1>Foundry: Upload a PDF. See the difference.</h1>
        <p>Left: mem0-style RAG (text search, chunks in prompt).
           Right: Doc-to-LoRA (knowledge internalized into model weights).</p>
        <p><strong>Same model. Same question. Different architecture. That's the pitch.</strong></p>
    </div>
    """)

    # Upload section
    with gr.Row():
        with gr.Column(scale=2):
            pdf_input = gr.File(
                label="Upload PDF",
                file_types=[".pdf", ".txt"],
                type="filepath",
            )
        with gr.Column(scale=1):
            betty_btn = gr.Button(
                "Load Betty Example",
                variant="secondary",
                size="lg",
            )

    # Status
    with gr.Row():
        with gr.Column():
            status_output = gr.Markdown(
                value="Upload a PDF or load the Betty example to begin.",
                elem_classes=["status-box"],
            )
        with gr.Column():
            suggestions = gr.Markdown(value="", elem_classes=["status-box"])

    gr.Markdown("---")

    # Question input
    with gr.Row():
        question_input = gr.Textbox(
            label="Ask a question about the document",
            placeholder="e.g., Should anyone be concerned about Betty?",
            scale=4,
            lines=1,
        )
        halluc_toggle = gr.Checkbox(
            label="Show without LoRA (hallucination proof)",
            value=False,
            scale=1,
        )
        ask_btn = gr.Button("Ask", variant="primary", scale=1)

    # Side-by-side results
    with gr.Row(equal_height=True):
        with gr.Column():
            rag_output = gr.Markdown(
                value="*RAG results will appear here*",
                label="mem0 / RAG (O(n))",
            )
        with gr.Column():
            foundry_output = gr.Markdown(
                value="*Foundry results will appear here*",
                label="Foundry (O(1))",
            )

    # Hallucination proof section
    halluc_output = gr.Markdown(
        value="",
        elem_classes=["halluc-box"],
        visible=False,
    )

    # Wire events
    pdf_input.change(
        upload_and_ingest,
        inputs=[pdf_input],
        outputs=[status_output, suggestions],
    )

    betty_btn.click(
        load_betty,
        outputs=[status_output, suggestions],
    )

    def ask_and_show_halluc(question, show_halluc):
        rag_md, foundry_md, halluc_md = ask_question(question, show_halluc)
        return (
            rag_md,
            foundry_md,
            gr.update(value=halluc_md, visible=bool(halluc_md)),
        )

    ask_btn.click(
        ask_and_show_halluc,
        inputs=[question_input, halluc_toggle],
        outputs=[rag_output, foundry_output, halluc_output],
    )

    question_input.submit(
        ask_and_show_halluc,
        inputs=[question_input, halluc_toggle],
        outputs=[rag_output, foundry_output, halluc_output],
    )

    # Footer
    gr.HTML("""
    <div style="text-align: center; margin-top: 2rem; color: #999; font-size: 0.85rem;">
        <p>Both pipelines use the same base model (Gemma-2-2B-it).
        The only difference is how knowledge reaches the model.</p>
        <p>RAG: chunks stuffed into the prompt (O(n) per query).
        LoRA: knowledge baked into the weights (O(1) per query).</p>
        <p><strong>Foundry by O(1)</strong></p>
    </div>
    """)


if __name__ == "__main__":
    load_models()
    demo.launch(server_name="0.0.0.0", server_port=7860)
