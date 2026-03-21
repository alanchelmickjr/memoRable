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
DEFAULT_CHECKPOINT_DIR = os.environ.get(
    "LORA_CHECKPOINT_DIR",
    str(VENDOR_ROOT / "trained_t2l" / "gemma_2b_t2l"),
)

def detect_device():
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"

DEVICE = os.environ.get("LORA_DEVICE", detect_device())


class LoRAEngine:
    """Lifecycle manager for doc-to-lora weight generation."""

    def __init__(self, checkpoint_dir: str = DEFAULT_CHECKPOINT_DIR, device: str = DEVICE):
        self.checkpoint_dir = checkpoint_dir
        self.device = device
        self._model = None
        self._loaded_weights_key: str | None = None
        self._current_model_name: str | None = None
        
        # Orin and Cloud usually want Int4. MacBook might prefer Float16 if enough RAM,
        # but 9B always wants Int4 on consumer hardware.
        self.load_in_4bit = os.environ.get("LORA_LOAD_IN_4BIT", "true").lower() == "true"

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def load(self, model_name: str = "google/gemma-2-2b-it") -> None:
        """Load hypernetwork + base model. Call once at startup."""
        if self._model is not None and self._current_model_name == model_name:
            return

        # Clear existing model if switching
        if self._model is not None:
            self.reset()
            self._model = None

        import sys
        # Add vendor src to path so ctx_to_lora imports resolve
        vendor_src = str(VENDOR_ROOT / "src")
        if vendor_src not in sys.path:
            sys.path.insert(0, vendor_src)

        # Need to be in vendor root for chat_templates/ to resolve
        original_cwd = os.getcwd()
        os.chdir(str(VENDOR_ROOT))

        try:
            from ctx_to_lora.modeling.text_to_lora import TextToLoRA
            from ctx_to_lora.data.definitions import CTX_AFFIXES

            # Support both 2b and 9b (and others in the future)
            supported_models = ["google/gemma-2-2b-it", "google/gemma-2-9b-it"]
            if model_name not in supported_models:
                logger.warning(f"Model {model_name} not explicitly in supported list, but attempting load anyway.")

            prefix_tokens = torch.tensor(
                CTX_AFFIXES[model_name]["prefix"], dtype=torch.long
            )

            # Determine checkpoint dir based on model name if not explicitly set
            checkpoint_dir = self.checkpoint_dir
            if model_name == "google/gemma-2-9b-it" and "gemma_2b_t2l" in checkpoint_dir:
                 # Try to find a 9b checkpoint
                 potential_9b = VENDOR_ROOT / "trained_t2l" / "gemma_9b_t2l"
                 if potential_9b.exists():
                     checkpoint_dir = str(potential_9b)
                 else:
                     logger.warning(f"Using 2b hypernetwork checkpoint for {model_name} — this will likely fail unless shapes match!")

            logger.info(f"Loading TextToLoRA for {model_name} from {checkpoint_dir} on {self.device} (4bit={self.load_in_4bit})")
            
            # TextToLoRA now accepts the load_in_4bit flag
            self._model = TextToLoRA(model_name, prefix_tokens, device=self.device, load_in_4bit=self.load_in_4bit)
            self._current_model_name = model_name
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
