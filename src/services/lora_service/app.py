"""
LoRA Service — FastAPI wrapper for doc-to-lora.

Three endpoints. Same service on cloud GPU, Chloe's Orin, or a laptop.
Little reusable modules, wrapped in good boundaries.
"""

import logging
import os
import tempfile

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .engine import LoRAEngine
from .storage import get_store, make_key

logger = logging.getLogger(__name__)

app = FastAPI(
    title="MemoRable LoRA Service",
    description="Real-time memory internalization via doc-to-lora hypernetwork",
    version="0.1.0",
)

# Lazy-loaded singletons — no work at import time
_engine: LoRAEngine | None = None
_store = None


def get_engine(model_name: str = "google/gemma-2-2b-it") -> LoRAEngine:
    global _engine
    if _engine is None:
        _engine = LoRAEngine()
        _engine.load(model_name)
    elif _engine._current_model_name != model_name:
        _engine.load(model_name)
    return _engine


def get_weight_store():
    global _store
    if _store is None:
        _store = get_store()
    return _store


# --- Request/Response models ---

class InternalizeRequest(BaseModel):
    document: str = Field(..., min_length=1, description="Document text to internalize")
    model: str = Field(default="gemma-2-2b", description="Base model family")


class InternalizeResponse(BaseModel):
    weights_key: str
    weights_uri: str
    status: str = "ok"


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="Prompt for generation")
    weights_key: str = Field(..., description="Weights key from /internalize")
    max_new_tokens: int = Field(default=256, ge=1, le=2048)


class GenerateResponse(BaseModel):
    response: str
    weights_key: str
    status: str = "ok"


class ResetResponse(BaseModel):
    status: str = "ok"
    message: str = "Weights cleared, base model restored"


# --- Endpoints ---

@app.post("/internalize", response_model=InternalizeResponse)
async def internalize(req: InternalizeRequest):
    """Feed a document, receive LoRA weights. The model now 'knows' it."""
    try:
        # Map simple model names to full HF names
        model_map = {
            "gemma-2-2b": "google/gemma-2-2b-it",
            "gemma-2-9b": "google/gemma-2-9b-it",
            "google/gemma-2-2b-it": "google/gemma-2-2b-it",
            "google/gemma-2-9b-it": "google/gemma-2-9b-it",
        }
        full_model_name = model_map.get(req.model, req.model)

        engine = get_engine(full_model_name)
        store = get_weight_store()

        key = make_key(req.document)

        # Generate to temp file, then store
        with tempfile.NamedTemporaryFile(suffix=".safetensors", delete=False) as f:
            tmp_path = f.name

        try:
            engine.generate_weights_to_file(req.document, tmp_path)
            uri = store.save(tmp_path, key)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

        return InternalizeResponse(weights_key=key, weights_uri=uri)

    except Exception as e:
        logger.exception("Internalize failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """Generate text with internalized knowledge applied."""
    try:
        engine = get_engine()
        store = get_weight_store()

        # Download weights to temp location if needed
        with tempfile.NamedTemporaryFile(suffix=".safetensors", delete=False) as f:
            tmp_path = f.name

        try:
            store.load(req.weights_key, tmp_path)
            response_text = engine.generate_text(
                req.prompt,
                weights_key=tmp_path,
                max_new_tokens=req.max_new_tokens,
            )
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

        return GenerateResponse(response=response_text, weights_key=req.weights_key)

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Weights not found: {req.weights_key}")
    except Exception as e:
        logger.exception("Generate failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reset", response_model=ResetResponse)
async def reset():
    """Clear loaded weights. Back to base model. No residue."""
    try:
        engine = get_engine()
        engine.reset()
        return ResetResponse()
    except Exception as e:
        logger.exception("Reset failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check — is the engine loaded, what device, what's active."""
    if _engine is not None:
        return _engine.health()
    return {
        "loaded": False,
        "device": os.environ.get("LORA_DEVICE", "unknown"),
        "status": "not_initialized",
    }
