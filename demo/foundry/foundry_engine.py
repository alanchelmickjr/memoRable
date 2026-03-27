"""
Foundry Engine — simplified LoRA pipeline for the investor demo.

Extracted from src/services/lora_service/engine.py. Holds lora_dict in memory
(no disk round-trip). Supports toggling LoRA on/off for the hallucination proof.
"""

import logging
import os
import sys
import time
from pathlib import Path

import torch

logger = logging.getLogger(__name__)

# Resolve vendor path relative to repo root
REPO_ROOT = Path(__file__).resolve().parents[2]
VENDOR_ROOT = REPO_ROOT / "vendors" / "doc-to-lora"
CHECKPOINT_DIR = os.environ.get(
    "LORA_CHECKPOINT_DIR",
    str(VENDOR_ROOT / "trained_t2l" / "gemma_2b_t2l"),
)


def detect_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


DEVICE = os.environ.get("LORA_DEVICE", detect_device())


class FoundryEngine:
    """LoRA weight generation and inference for the Foundry demo."""

    def __init__(self, checkpoint_dir: str = CHECKPOINT_DIR, device: str = DEVICE):
        self.checkpoint_dir = checkpoint_dir
        self.device = device
        self._model = None       # TextToLoRA instance
        self._lora_dict = None   # Real LoRA weights from last ingest
        self._zero_dict = None   # Zero-valued weights (same shape) for "LoRA off"
        self._lora_active = False
        self._ingested_text = None

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def is_ingested(self) -> bool:
        return self._lora_dict is not None

    def load(self) -> None:
        """Load hypernetwork + base model. Call once at startup."""
        if self._model is not None:
            return

        vendor_src = str(VENDOR_ROOT / "src")
        if vendor_src not in sys.path:
            sys.path.insert(0, vendor_src)

        original_cwd = os.getcwd()
        os.chdir(str(VENDOR_ROOT))

        try:
            from ctx_to_lora.data.definitions import CTX_AFFIXES
            from ctx_to_lora.modeling.text_to_lora import TextToLoRA

            model_name = "google/gemma-2-2b-it"
            prefix_tokens = torch.tensor(
                CTX_AFFIXES[model_name]["prefix"], dtype=torch.long
            )

            # bitsandbytes 4-bit doesn't work on MPS
            load_in_4bit = self.device != "mps"

            logger.info(f"Loading TextToLoRA on {self.device} (4bit={load_in_4bit})")
            self._model = TextToLoRA(
                model_name, prefix_tokens, device=self.device,
                load_in_4bit=load_in_4bit,
            )
            logger.info("TextToLoRA loaded")
        finally:
            os.chdir(original_cwd)

    def ingest(self, text: str) -> float:
        """
        Internalize a document into LoRA weights.

        Returns elapsed time in seconds.
        """
        if not self.is_loaded:
            self.load()

        start = time.time()

        with torch.no_grad():
            self._lora_dict = self._model.generate_weights(text)

        # Create zero-weight copy (same shape, contributes nothing)
        self._zero_dict = {}
        for module_name, ab in self._lora_dict.items():
            self._zero_dict[module_name] = {
                "A": torch.zeros_like(ab["A"]),
                "B": torch.zeros_like(ab["B"]),
            }

        # Apply real weights
        self._apply_weights(self._lora_dict)
        self._lora_active = True
        self._ingested_text = text

        elapsed = time.time() - start
        logger.info(f"Ingested document ({len(text)} chars) in {elapsed:.2f}s")
        return elapsed

    def generate(self, prompt: str, use_lora: bool = True,
                 max_new_tokens: int = 512) -> tuple[str, float]:
        """
        Generate text with or without LoRA weights.

        Args:
            prompt: The full prompt (may include RAG context prefix).
            use_lora: True = knowledge in weights. False = base model only.
            max_new_tokens: Max generation length.

        Returns:
            (generated_text, elapsed_seconds)
        """
        if not self.is_loaded:
            raise RuntimeError("Engine not loaded. Call load() first.")

        # Toggle weights if needed
        if use_lora and not self._lora_active and self._lora_dict is not None:
            self._apply_weights(self._lora_dict)
            self._lora_active = True
        elif not use_lora and self._lora_active:
            self._apply_weights(self._zero_dict)
            self._lora_active = False

        start = time.time()

        tokenizer = self._model.tokenizer
        input_ids = tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}],
            return_tensors="pt",
            return_dict=True,
        )
        input_ids = {k: v.to(self.device) for k, v in input_ids.items()}

        with torch.no_grad():
            outputs = self._model.base_model.generate(
                **input_ids,
                max_new_tokens=max_new_tokens,
                do_sample=False,
            )

        # Decode only the new tokens (skip the prompt)
        prompt_len = input_ids["input_ids"].shape[1]
        response = tokenizer.decode(
            outputs[0][prompt_len:], skip_special_tokens=True
        )

        elapsed = time.time() - start
        return response, elapsed

    def _apply_weights(self, lora_dict: dict) -> None:
        """Apply LoRA weights to the base model layers."""
        from ctx_to_lora.modeling.lora_layer import apply_lora_to_layers

        apply_lora_to_layers(
            self._model.base_model,
            self._model.layer_indices,
            lora_dict,
            n_qs=torch.tensor([1], device=self.device),
            position_ids=None,
        )

    def reset(self) -> None:
        """Clear ingested document and LoRA weights."""
        if self._lora_dict is not None and self._lora_active:
            self._apply_weights(self._zero_dict)
            self._lora_active = False
        self._lora_dict = None
        self._zero_dict = None
        self._ingested_text = None
