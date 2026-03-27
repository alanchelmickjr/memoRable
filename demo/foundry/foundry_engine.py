"""
Foundry Engine — LoRA pipeline for the investor demo.

Uses ModulatedPretrainedModel from doc-to-lora (the vendor's recommended API).
Loads checkpoint, internalizes documents, generates with/without LoRA.
The reset() properly restores original forward passes — no zero-weight hacks.
"""

import logging
import os
import sys
import time
from pathlib import Path

import torch

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
VENDOR_ROOT = REPO_ROOT / "vendors" / "doc-to-lora"
CHECKPOINT_PATH = os.environ.get(
    "LORA_CHECKPOINT",
    str(VENDOR_ROOT / "trained_d2l" / "gemma_2b_d2l" / "checkpoint-20000" / "pytorch_model.bin"),
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

    def __init__(self, checkpoint_path: str = CHECKPOINT_PATH, device: str = DEVICE):
        self.checkpoint_path = checkpoint_path
        self.device = device
        self._model = None       # ModulatedPretrainedModel
        self._tokenizer = None
        self._ingested = False
        self._ingested_text = None

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def is_ingested(self) -> bool:
        return self._ingested

    def load(self) -> None:
        """Load hypernetwork + base model from checkpoint. Call once at startup."""
        if self._model is not None:
            return

        vendor_src = str(VENDOR_ROOT / "src")
        if vendor_src not in sys.path:
            sys.path.insert(0, vendor_src)

        original_cwd = os.getcwd()
        os.chdir(str(VENDOR_ROOT))

        try:
            from ctx_to_lora.model_loading import get_tokenizer
            from ctx_to_lora.modeling.hypernet import ModulatedPretrainedModel

            logger.info(f"Loading checkpoint from {self.checkpoint_path} on {self.device}")

            state_dict = torch.load(self.checkpoint_path, weights_only=False, map_location=self.device)
            self._model = ModulatedPretrainedModel.from_state_dict(
                state_dict,
                train=False,
                use_sequence_packing=False,
            )
            self._model.reset()
            self._tokenizer = get_tokenizer(self._model.base_model.name_or_path)

            logger.info("ModulatedPretrainedModel loaded")
        finally:
            os.chdir(original_cwd)

    def ingest(self, text: str) -> float:
        """
        Internalize a document into LoRA weights.

        Returns elapsed time in seconds.
        """
        if not self.is_loaded:
            self.load()

        # Reset any previous internalization
        self._model.reset()
        self._model.patch_lora_forward()

        start = time.time()
        self._model.internalize(text)
        elapsed = time.time() - start

        self._ingested = True
        self._ingested_text = text

        logger.info(f"Ingested document ({len(text)} chars) in {elapsed:.2f}s")
        return elapsed

    def generate(self, prompt: str, use_lora: bool = True,
                 max_new_tokens: int = 512) -> tuple:
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

        # Toggle LoRA state
        if not use_lora and self._ingested:
            # Temporarily reset to get base model behavior
            saved_loras = self._model.generated_loras
            self._model.generated_loras = None
            self._model.reset()

        start = time.time()

        chat = [{"role": "user", "content": prompt}]
        input_ids = self._tokenizer.apply_chat_template(
            chat,
            add_special_tokens=False,
            return_attention_mask=False,
            add_generation_prompt=True,
            return_tensors="pt",
        ).to(self.device)

        if use_lora and self._ingested:
            # Generate with internalized LoRA
            outputs = self._model.generate(
                input_ids=input_ids,
                max_new_tokens=max_new_tokens,
                do_sample=False,
            )
        else:
            # Generate with base model only (no LoRA)
            outputs = self._model.base_model.generate(
                input_ids=input_ids,
                max_new_tokens=max_new_tokens,
                do_sample=False,
            )

        # Decode only new tokens
        prompt_len = input_ids.shape[1]
        response = self._tokenizer.decode(
            outputs[0][prompt_len:], skip_special_tokens=True
        )

        elapsed = time.time() - start

        # Restore LoRA state if we temporarily disabled it
        if not use_lora and self._ingested:
            self._model.generated_loras = saved_loras
            self._model.patch_lora_forward()

        return response, elapsed

    def reset(self) -> None:
        """Clear ingested document and LoRA weights."""
        if self._model is not None:
            self._model.reset()
        self._ingested = False
        self._ingested_text = None
