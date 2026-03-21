
import sys
import os
from pathlib import Path
import torch

# Add vendor paths
VENDOR_ROOT = Path("vendors/doc-to-lora")
sys.path.insert(0, str(VENDOR_ROOT / "src"))

try:
    from ctx_to_lora.modeling.text_to_lora_impl import get_model
    print("Successfully imported get_model")
    
    # Mock parameters for a dry run check of signature
    import inspect
    sig = inspect.signature(get_model)
    if "load_in_4bit" in sig.parameters:
        print("SUCCESS: get_model accepts load_in_4bit")
    else:
        print("FAILURE: get_model does NOT accept load_in_4bit")
        sys.exit(1)

except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
