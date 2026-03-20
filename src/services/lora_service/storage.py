"""
Weight Storage — S3 or local, same interface.

Cloud GPU saves to S3. Chloe's Orin saves to SSD. Same code path.
Portable and succinct. These are a few of our favorite things.
"""

import hashlib
import logging
import os
import time
from abc import ABC, abstractmethod
from pathlib import Path

logger = logging.getLogger(__name__)


def _make_key(document: str) -> str:
    """Deterministic key from document content."""
    doc_hash = hashlib.sha256(document.encode()).hexdigest()[:16]
    ts = int(time.time())
    return f"lora_{ts}_{doc_hash}.safetensors"


class WeightStore(ABC):
    """Abstract weight storage. S3 or local — same interface."""

    @abstractmethod
    def save(self, local_path: str, key: str) -> str:
        """Save weights file, return canonical URI."""

    @abstractmethod
    def load(self, key: str, local_path: str) -> str:
        """Download weights to local_path, return local_path."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        """Check if weights exist."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Delete weights."""


class LocalStore(WeightStore):
    """Store weights on local disk. For robots, laptops, dev."""

    def __init__(self, base_dir: str | None = None):
        self.base_dir = Path(base_dir or os.environ.get(
            "LORA_WEIGHTS_DIR", "/tmp/memorable-lora-weights"
        ))
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save(self, local_path: str, key: str) -> str:
        dest = self.base_dir / key
        if str(Path(local_path).resolve()) != str(dest.resolve()):
            import shutil
            shutil.copy2(local_path, dest)
        uri = f"local://{dest}"
        logger.info(f"Saved weights: {uri}")
        return uri

    def load(self, key: str, local_path: str) -> str:
        src = self.base_dir / key
        if not src.exists():
            raise FileNotFoundError(f"Weights not found: {key}")
        if str(Path(local_path).resolve()) != str(src.resolve()):
            import shutil
            shutil.copy2(src, local_path)
        return local_path

    def exists(self, key: str) -> bool:
        return (self.base_dir / key).exists()

    def delete(self, key: str) -> None:
        path = self.base_dir / key
        if path.exists():
            path.unlink()
            logger.info(f"Deleted weights: {key}")


class S3Store(WeightStore):
    """Store weights in S3. For cloud deployments."""

    def __init__(self, bucket: str | None = None, prefix: str = "lora-weights"):
        self.bucket = bucket or os.environ.get("LORA_S3_BUCKET", "memorable-lora")
        self.prefix = prefix
        self._client = None

    @property
    def client(self):
        if self._client is None:
            import boto3
            self._client = boto3.client("s3")
        return self._client

    def _s3_key(self, key: str) -> str:
        return f"{self.prefix}/{key}"

    def save(self, local_path: str, key: str) -> str:
        s3_key = self._s3_key(key)
        self.client.upload_file(local_path, self.bucket, s3_key)
        uri = f"s3://{self.bucket}/{s3_key}"
        logger.info(f"Saved weights: {uri}")
        return uri

    def load(self, key: str, local_path: str) -> str:
        s3_key = self._s3_key(key)
        self.client.download_file(self.bucket, s3_key, local_path)
        return local_path

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=self._s3_key(key))
            return True
        except self.client.exceptions.ClientError:
            return False

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=self._s3_key(key))
        logger.info(f"Deleted weights: {key}")


def get_store() -> WeightStore:
    """Factory — pick backend from env. Default: local for dev, S3 for cloud."""
    backend = os.environ.get("LORA_STORAGE_BACKEND", "local")
    if backend == "s3":
        return S3Store()
    return LocalStore()


def make_key(document: str) -> str:
    """Public key generator."""
    return _make_key(document)
