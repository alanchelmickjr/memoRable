"""
RAG Pipeline — minimal mem0-equivalent for the Foundry demo.

Chunks text, embeds with sentence-transformers, stores in ChromaDB,
retrieves top-k chunks for a query. No cloud deps, fully self-contained.
"""

import logging
import time
import uuid

import chromadb
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
CHUNK_SIZE = 512       # target tokens per chunk (approximated by words)
CHUNK_OVERLAP = 64     # overlap between chunks
TOP_K = 5              # chunks to retrieve


class RAGPipeline:
    """Chunk/embed/retrieve pipeline using sentence-transformers + ChromaDB."""

    def __init__(self, embed_model: str = EMBED_MODEL):
        self._embed_model_name = embed_model
        self._embedder = None
        self._client = None
        self._collection = None
        self._chunk_count = 0

    @property
    def is_loaded(self) -> bool:
        return self._embedder is not None

    @property
    def is_ingested(self) -> bool:
        return self._chunk_count > 0

    def load(self) -> None:
        """Load embedding model and create ChromaDB collection."""
        if self._embedder is not None:
            return

        logger.info(f"Loading embedding model: {self._embed_model_name}")
        self._embedder = SentenceTransformer(self._embed_model_name)
        self._client = chromadb.Client()  # ephemeral, in-memory
        self._collection = self._client.create_collection(
            name="foundry_demo",
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("RAG pipeline ready")

    def ingest(self, text: str) -> float:
        """
        Chunk text, embed, and store in ChromaDB.

        Returns elapsed time in seconds.
        """
        if not self.is_loaded:
            self.load()

        # Reset if re-ingesting
        self.reset()

        start = time.time()

        chunks = self._chunk_text(text)
        if not chunks:
            return 0.0

        # Embed all chunks
        embeddings = self._embedder.encode(chunks, show_progress_bar=False)

        # Store in ChromaDB
        ids = [f"chunk_{i}" for i in range(len(chunks))]
        self._collection.add(
            ids=ids,
            documents=chunks,
            embeddings=embeddings.tolist(),
            metadatas=[{"chunk_idx": i} for i in range(len(chunks))],
        )
        self._chunk_count = len(chunks)

        elapsed = time.time() - start
        logger.info(f"Ingested {len(chunks)} chunks in {elapsed:.2f}s")
        return elapsed

    def retrieve(self, query: str, top_k: int = TOP_K) -> list[str]:
        """Retrieve the top-k most relevant chunks for a query."""
        if not self.is_ingested:
            return []

        query_embedding = self._embedder.encode([query], show_progress_bar=False)
        results = self._collection.query(
            query_embeddings=query_embedding.tolist(),
            n_results=min(top_k, self._chunk_count),
        )
        return results["documents"][0] if results["documents"] else []

    def build_prompt(self, question: str, chunks: list[str]) -> str:
        """Format retrieved chunks + question into a prompt for the LLM."""
        context = "\n\n---\n\n".join(chunks)
        return (
            f"Answer the following question based ONLY on the provided context. "
            f"Synthesize information from all relevant passages.\n\n"
            f"Context:\n{context}\n\n"
            f"Question: {question}\n\n"
            f"Answer:"
        )

    def reset(self) -> None:
        """Clear all stored chunks."""
        if self._collection is not None and self._chunk_count > 0:
            # Delete and recreate collection (ChromaDB doesn't have truncate)
            self._client.delete_collection("foundry_demo")
            self._collection = self._client.create_collection(
                name="foundry_demo",
                metadata={"hnsw:space": "cosine"},
            )
            self._chunk_count = 0

    def _chunk_text(self, text: str) -> list[str]:
        """
        Split text into chunks using paragraph-first strategy.

        Intentionally naive — RAG's weakness with scattered facts is part
        of the demo's point. Splits by paragraphs, then merges small ones
        until hitting ~CHUNK_SIZE words, with CHUNK_OVERLAP word overlap.
        """
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        if not paragraphs:
            paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
        if not paragraphs:
            return [text] if text.strip() else []

        chunks = []
        current_chunk_words = []
        current_word_count = 0

        for para in paragraphs:
            para_words = para.split()
            para_word_count = len(para_words)

            if current_word_count + para_word_count > CHUNK_SIZE and current_chunk_words:
                # Flush current chunk
                chunks.append(" ".join(current_chunk_words))

                # Keep overlap from end of current chunk
                overlap_words = current_chunk_words[-CHUNK_OVERLAP:] if len(current_chunk_words) > CHUNK_OVERLAP else []
                current_chunk_words = overlap_words + para_words
                current_word_count = len(current_chunk_words)
            else:
                current_chunk_words.extend(para_words)
                current_word_count += para_word_count

        # Flush remaining
        if current_chunk_words:
            chunks.append(" ".join(current_chunk_words))

        return chunks
