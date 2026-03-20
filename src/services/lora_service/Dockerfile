# MemoRable LoRA Service
# Runs on: cloud GPU (g4dn/g5), Chloe's AGX Orin 64, any CUDA box
# Base: NVIDIA CUDA for broad GPU compat

FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git \
    && rm -rf /var/lib/apt/lists/*

# Python deps — pinned for reproducibility
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy service code
COPY . /app/lora_service/

# Copy vendor (doc-to-lora) — needed for model code + checkpoints
# In production, mount checkpoints as a volume instead
COPY ../../vendors/doc-to-lora /app/vendors/doc-to-lora

ENV LORA_DEVICE=cuda
ENV LORA_STORAGE_BACKEND=local
ENV LORA_WEIGHTS_DIR=/data/weights
ENV LORA_CHECKPOINT_DIR=/app/vendors/doc-to-lora/trained_t2l/gemma_2b_t2l

EXPOSE 8090

# Health check — no hardcoded time values, use Docker's defaults
HEALTHCHECK CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8090/health')" || exit 1

CMD ["python3", "-m", "uvicorn", "lora_service.app:app", "--host", "0.0.0.0", "--port", "8090"]
