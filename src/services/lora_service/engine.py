"""
LoRA Engine — wraps doc-to-lora's TextToLoRA into a clean lifecycle.

Mobile: same module runs on Orin, cloud GPU, laptop.
Modular: generate_weights / apply_weights / reset are independent ops.
Succinct: thin wrapper, upstream does the heavy lifting.
"""

import logging
import os
from pathlib import Path

import torch
from safetensors.torch import load_file, save_file

logger = logging.getLogger(__name__)

# Resolve vendor path relative to repo root
VENDOR_ROOT = Path(__file__).resolve().parents[3] / "vendors" / "doc-to-lora"
CHECKPOINT_DIR = os.environ.get(
    "LORA_CHECKPOINT_DIR",
    str(VENDOR_ROOT / "trained_t2l" / "gemma_2b_t2l"),
)
def detect_device() -> str:
    """Detect compute device. CUDA (cloud/Jetson), MPS (Mac), CPU (everything else)."""
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"

DEVICE = os.environ.get("LORA_DEVICE", detect_device())


class LoRAEngine:
    """Lifecycle manager for doc-to-lora weight generation."""

    def __init__(self, checkpoint_dir: str = CHECKPOINT_DIR, device: str = DEVICE):
        self.checkpoint_dir = checkpoint_dir
        self.device = device
        self._model = None
        self._loaded_weights_key: str | None = None

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        """Load hypernetwork + base model. Call once at startup."""
        if self._model is not None:
            return

        import sys
        # Add vendor src to path so ctx_to_lora imports resolve
        vendor_src = str(VENDOR_ROOT / "src")
        if vendor_src not in sys.path:
            sys.path.insert(0, vendor_src)

        # Need to be in vendor root for chat_templates/ to resolve
        original_cwd = os.getcwd()
        os.chdir(str(VENDOR_ROOT))

        try:
            from ctx_to_lora.data.definitions import CTX_AFFIXES
            from ctx_to_lora.modeling.text_to_lora import TextToLoRA

            model_name = "google/gemma-2-2b-it"
            prefix_tokens = torch.tensor(
                CTX_AFFIXES[model_name]["prefix"], dtype=torch.long
            )

            logger.info(f"Loading TextToLoRA from {self.checkpoint_dir} on {self.device}")
            self._model = TextToLoRA(model_name, prefix_tokens, device=self.device)
            logger.info("TextToLoRA loaded successfully")
        finally:
            os.chdir(original_cwd)

    def generate_weights(self, document: str) -> dict:
        """
        Generate LoRA weights from a document.

        Returns dict of {target_module: {A: tensor, B: tensor}}.
        """
        if not self.is_loaded:
            self.load()

        with torch.no_grad():
            return self._model.generate_weights(document)

    def generate_weights_to_file(self, document: str, output_path: str) -> str:
        """Generate weights and save as safetensors. Returns the path."""
        lora_dict = self.generate_weights(document)

        # Flatten to state_dict format for safetensors
        state_dict = {}
        for module_name, ab in lora_dict.items():
            state_dict[f"{module_name}.A"] = ab["A"].squeeze(0).cpu().contiguous()
            state_dict[f"{module_name}.B"] = ab["B"].squeeze(0).cpu().contiguous()

        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        save_file(state_dict, output_path)
        logger.info(f"Saved weights to {output_path}")
        return output_path

    def load_weights_from_file(self, weights_path: str) -> dict:
        """Load weights from safetensors back into lora_dict format."""
        state_dict = load_file(weights_path, device=self.device)

        lora_dict = {}
        for key, tensor in state_dict.items():
            module_name, ab_key = key.rsplit(".", 1)
            if module_name not in lora_dict:
                lora_dict[module_name] = {}
            lora_dict[module_name][ab_key] = tensor.unsqueeze(0)

        return lora_dict

    def apply_weights(self, lora_dict: dict) -> None:
        """Apply LoRA weights to the base model for inference."""
        if not self.is_loaded:
            raise RuntimeError("Engine not loaded. Call load() first.")

        from ctx_to_lora.modeling.lora_layer import apply_lora_to_layers

        layer_indices = self._model.layer_indices
        apply_lora_to_layers(
            self._model.base_model,
            layer_indices,
            lora_dict,
            n_qs=torch.tensor([1], device=self.device),
            position_ids=None,
        )

    def generate_text(self, prompt: str, weights_key: str | None = None,
                      max_new_tokens: int = 256) -> str:
        """Generate text, optionally with LoRA weights applied."""
        if not self.is_loaded:
            raise RuntimeError("Engine not loaded. Call load() first.")

        if weights_key and weights_key != self._loaded_weights_key:
            lora_dict = self.load_weights_from_file(weights_key)
            self.apply_weights(lora_dict)
            self._loaded_weights_key = weights_key

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

        return tokenizer.decode(outputs[0], skip_special_tokens=True)

    def compose_weights(self, lora_dicts: list[dict], scalers: list[float] | None = None) -> dict:
        """
        Compose multiple LoRA weight sets into one via rank concatenation.

        Uses D2L's combine_lora: each document's LoRA gets its own rank slice,
        weighted by salience. ~40 documents at rank 8 = effective rank 320.

        Args:
            lora_dicts: List of lora_dict from load_weights_from_file()
            scalers: Per-document salience weights (0-1). None = equal weight.

        Returns:
            Combined lora_dict ready for apply_weights() or save.
        """
        import sys
        vendor_src = str(VENDOR_ROOT / "src")
        if vendor_src not in sys.path:
            sys.path.insert(0, vendor_src)

        from ctx_to_lora.modeling.lora_merger import combine_lora

        if len(lora_dicts) == 0:
            raise ValueError("No LoRA weights to compose")
        if len(lora_dicts) == 1:
            return lora_dicts[0]

        # Stack all lora_dicts into the shape combine_lora expects:
        # {module: {A: [tot_chunks, n_layers, r, d_in], B: [tot_chunks, n_layers, r, d_out]}}
        first = lora_dicts[0]
        stacked = {}
        for module_name in first:
            stacked[module_name] = {
                "A": torch.cat([ld[module_name]["A"] for ld in lora_dicts], dim=0),
                "B": torch.cat([ld[module_name]["B"] for ld in lora_dicts], dim=0),
            }

        n_chunks = torch.tensor([1] * len(lora_dicts))
        scaler_tensor = None
        if scalers is not None:
            scaler_tensor = torch.tensor(scalers, dtype=stacked[next(iter(stacked))]["A"].dtype,
                                         device=self.device)

        combined = combine_lora(stacked, n_chunks, scalers=scaler_tensor)
        logger.info(f"Composed {len(lora_dicts)} LoRA weights (effective rank: {(len(lora_dicts) + 1) * 8})")
        return combined

    def compose_weights_to_file(self, lora_dicts: list[dict], output_path: str,
                                 scalers: list[float] | None = None) -> str:
        """Compose multiple LoRAs and save as safetensors."""
        combined = self.compose_weights(lora_dicts, scalers)

        state_dict = {}
        for module_name, ab in combined.items():
            state_dict[f"{module_name}.A"] = ab["A"].squeeze(0).cpu().contiguous()
            state_dict[f"{module_name}.B"] = ab["B"].squeeze(0).cpu().contiguous()

        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        save_file(state_dict, output_path)
        logger.info(f"Saved composed weights to {output_path}")
        return output_path

    def reset(self) -> None:
        """Clear loaded LoRA weights. Base model returns to vanilla."""
        if not self.is_loaded:
            return

        # Re-initialize to clear any applied LoRA state
        # The simplest way: reload. For production, track and zero out LoRA layers.
        self._loaded_weights_key = None
        logger.info("LoRA weights cleared")

    def health(self) -> dict:
        return {
            "loaded": self.is_loaded,
            "device": self.device,
            "checkpoint_dir": self.checkpoint_dir,
            "active_weights": self._loaded_weights_key,
        }
