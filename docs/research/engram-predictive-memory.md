# Implementing Engram-Style Conditional Memory for memoRable

**Bottom line:** Building a predictive memory system that anticipates user needs before they ask requires combining Engram's O(1) multi-head hashing with Zipfian cache hierarchies, context-aware gating, and temporal pattern detection across a MongoDB/Redis/Weaviate stack. The biggest competitive gap in existing solutions (Mem0, Zep, Letta) is true **anticipatory surfacing**—memoRable can differentiate by implementing proactive context retrieval learned from user behavior patterns over a **66-day window** (not 21 days, which is a myth).

---

## O(1) pattern lookup with multi-head hashing

The Engram paper (arXiv:2601.07372, January 2026) introduces **conditional memory** that separates static pattern storage from dynamic computation. For a production MongoDB/Redis/Weaviate stack, the key insight is that hash indices are **deterministically computable** from input tokens alone—no learned routing required.

### Multi-head hashing implementation for Redis

Engram uses **K=8 hash heads** with distinct prime moduli to mitigate collisions. Each N-gram (bigrams, trigrams) gets hashed through all 8 heads, producing 8 candidate embeddings that are concatenated:

```python
import hashlib
from typing import List, Dict
import redis

class EngramMultiHeadHash:
    """K=8 multi-head hashing for O(1) pattern lookup in Redis"""
    
    # Prime moduli per head (distinct primes reduce collision overlap)
    PRIMES = [10007, 10009, 10037, 10039, 10061, 10067, 10069, 10079]
    
    def __init__(self, redis_client: redis.Redis, embedding_dim: int = 64):
        self.redis = redis_client
        self.K = 8  # Number of hash heads
        self.embedding_dim = embedding_dim
        
    def compute_ngram_hash(self, tokens: List[int], head_idx: int) -> int:
        """Multiplicative-XOR hash for single head"""
        # Layer-specific seed with prime multipliers
        hash_val = 0
        for i, token in enumerate(tokens):
            multiplier = (2 * i + 1)  # Odd integers for non-zero contribution
            hash_val ^= (token * multiplier)
        return hash_val % self.PRIMES[head_idx]
    
    def get_pattern_key(self, ngram_type: int, head_idx: int, hash_val: int) -> str:
        """Construct Redis key for pattern embedding"""
        return f"engram:{ngram_type}gram:h{head_idx}:{hash_val}"
    
    async def lookup_pattern(self, tokens: List[int]) -> List[bytes]:
        """O(1) lookup across all heads - returns concatenated embeddings"""
        embeddings = []
        pipe = self.redis.pipeline()
        
        # 2-grams and 3-grams with K=8 heads each = 16 lookups
        for ngram_size in [2, 3]:
            if len(tokens) >= ngram_size:
                ngram = tokens[-ngram_size:]
                for head_idx in range(self.K):
                    hash_val = self.compute_ngram_hash(ngram, head_idx)
                    key = self.get_pattern_key(ngram_size, head_idx, hash_val)
                    pipe.get(key)
        
        results = await pipe.execute()
        return [r for r in results if r is not None]

# MongoDB schema for warm storage of pattern embeddings
ENGRAM_PATTERN_SCHEMA = {
    "_id": "ObjectId",
    "pattern_key": "string",           # e.g., "engram:2gram:h0:10007"
    "ngram_tokens": "[int]",           # Compressed token IDs
    "embedding": "BinData",            # Float32 array (64-dim)
    "access_count": "int",             # For Zipfian tier promotion
    "last_accessed": "ISODate",
    "layer_id": "int"                  # Engram insertion layer (1 or 15)
}
```

### N-gram tokenization with vocabulary compression

Before hashing, Engram applies **vocabulary compression** (23% reduction) to normalize tokens:

```python
import unicodedata

class TokenizerCompressor:
    """Normalize tokens before N-gram construction (per Engram paper)"""
    
    def __init__(self, original_vocab_size: int = 129280):
        self.lookup_table = {}  # original_id -> compressed_id
        self._build_compression_table()
    
    def _normalize_token(self, token_str: str) -> str:
        """NFKC → NFD → strip accents → lowercase → collapse whitespace"""
        # NFKC normalization
        normalized = unicodedata.normalize('NFKC', token_str)
        # NFD decomposition
        decomposed = unicodedata.normalize('NFD', normalized)
        # Strip accents (combining characters)
        stripped = ''.join(c for c in decomposed 
                         if unicodedata.category(c) != 'Mn')
        # Lowercase and collapse whitespace
        return ' '.join(stripped.lower().split())
    
    def compress_sequence(self, token_ids: List[int]) -> List[int]:
        """Map original token IDs to compressed vocabulary"""
        return [self.lookup_table.get(t, t) for t in token_ids]
```

### Weaviate schema for semantic fallback

When hash collisions produce irrelevant patterns (detected via low gate values), fall back to Weaviate vector search:

```json
{
  "class": "NgramPattern",
  "description": "Semantic backup for collision-affected patterns",
  "vectorizer": "text2vec-openai",
  "properties": [
    {"name": "tokens", "dataType": ["int[]"], "indexFilterable": true},
    {"name": "context", "dataType": ["text"]},
    {"name": "mongoRef", "dataType": ["string"]},
    {"name": "collisionRate", "dataType": ["number"]}
  ],
  "vectorIndexConfig": {
    "distance": "cosine",
    "ef": 256,
    "maxConnections": 64
  }
}
```

---

## Context-aware gating implementation

The Engram gating formula suppresses irrelevant retrieved patterns by computing semantic alignment between current context and retrieved memory:

```
α_t = σ(RMSNorm(h_t)ᵀ · RMSNorm(W_K·e_t) / √d)
```

### Component breakdown

| Symbol | Meaning | Production Implementation |
|--------|---------|---------------------------|
| `h_t` | Current hidden state (query) | Last transformer layer output or conversation embedding |
| `e_t` | Retrieved memory embedding | Concatenated N-gram embeddings from multi-head hash |
| `W_K` | Key projection matrix | Learnable linear layer: `nn.Linear(d_mem, d_hidden)` |
| `RMSNorm` | Root mean square normalization | Gradient-stable normalization |
| `√d` | Dimension scaling | Prevents dot product explosion |
| `σ` | Sigmoid | Produces gate α_t ∈ (0, 1) |

### Implementation options for retrieval pipeline

**Option A: Neural gating (recommended for quality)**

```python
import torch
import torch.nn as nn

class ContextAwareGate(nn.Module):
    """Learnable gating per Engram formula"""
    
    def __init__(self, hidden_dim: int = 1024, memory_dim: int = 1024):
        super().__init__()
        self.W_K = nn.Linear(memory_dim, hidden_dim, bias=False)
        self.W_V = nn.Linear(memory_dim, hidden_dim, bias=False)
        self.rms_norm = nn.RMSNorm(hidden_dim)
        self.scale = hidden_dim ** -0.5
        
    def forward(self, h_t: torch.Tensor, e_t: torch.Tensor) -> tuple:
        """
        Args:
            h_t: Current context embedding [batch, hidden_dim]
            e_t: Retrieved memory embedding [batch, memory_dim]
        Returns:
            gated_value: Memory weighted by relevance gate
            gate_score: α_t for interpretability
        """
        # Project memory to key and value
        k_t = self.W_K(e_t)
        v_t = self.W_V(e_t)
        
        # RMSNorm both vectors
        h_normed = self.rms_norm(h_t)
        k_normed = self.rms_norm(k_t)
        
        # Compute gate via scaled dot product
        gate_score = torch.sigmoid(
            (h_normed * k_normed).sum(dim=-1, keepdim=True) * self.scale
        )
        
        # Apply gate to value
        gated_value = gate_score * v_t
        
        return gated_value, gate_score
```

**Option B: Similarity threshold approximation (lighter weight)**

For systems without neural components, approximate gating with cosine similarity thresholds:

```python
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

class ThresholdGate:
    """Non-neural gating approximation using cosine similarity"""
    
    def __init__(self, threshold: float = 0.5, decay_factor: float = 0.1):
        self.threshold = threshold
        self.decay_factor = decay_factor
    
    def compute_gate(self, context_embedding: np.ndarray, 
                     memory_embedding: np.ndarray) -> float:
        """
        Returns gate value ∈ [0, 1] based on cosine similarity.
        Uses soft thresholding instead of hard cutoff.
        """
        similarity = cosine_similarity(
            context_embedding.reshape(1, -1),
            memory_embedding.reshape(1, -1)
        )[0, 0]
        
        # Soft sigmoid-like gate centered at threshold
        gate = 1 / (1 + np.exp(-10 * (similarity - self.threshold)))
        return gate
    
    def filter_memories(self, context_emb: np.ndarray, 
                       memories: List[dict], 
                       min_gate: float = 0.3) -> List[dict]:
        """Filter retrieved memories by gate threshold"""
        gated_memories = []
        for mem in memories:
            gate = self.compute_gate(context_emb, mem['embedding'])
            if gate >= min_gate:
                mem['gate_score'] = gate
                gated_memories.append(mem)
        
        # Sort by gate score descending
        return sorted(gated_memories, key=lambda x: x['gate_score'], reverse=True)
```

**Recommendation:** Start with threshold approximation for MVP, migrate to neural gating as you collect training data from user feedback on memory relevance.

---

## Continual learning for pattern recognition

The Mirzadeh et al. (2022) paper "Architecture Matters in Continual Learning" establishes that **architectural choices matter as much as algorithms** for preventing catastrophic forgetting.

### Key architectural recommendations

| Finding | Implementation | Rationale |
|---------|----------------|-----------|
| **Width > Depth** | 3-4 layers, 512-1024 units | Wider networks have more capacity for task-specific representations |
| **Replace BatchNorm** | Use LayerNorm or Continual Normalization | BN running statistics bias toward current task |
| **Avoid aggressive GAP** | Use max pooling or learned downsampling | Global Average Pooling loses task-discriminative spatial features |

### Production continual learning pipeline

```python
import torch
import torch.nn as nn
from typing import List, Tuple
import random

class ReplayBuffer:
    """Reservoir sampling for memory-efficient experience replay"""
    
    def __init__(self, max_size: int = 5000):
        self.buffer: List[Tuple] = []
        self.max_size = max_size
        self.n_seen = 0
    
    def add(self, x: torch.Tensor, y: torch.Tensor):
        self.n_seen += 1
        if len(self.buffer) < self.max_size:
            self.buffer.append((x.detach().cpu(), y.detach().cpu()))
        else:
            # Reservoir sampling
            idx = random.randint(0, self.n_seen - 1)
            if idx < self.max_size:
                self.buffer[idx] = (x.detach().cpu(), y.detach().cpu())
    
    def sample(self, batch_size: int) -> Tuple[torch.Tensor, torch.Tensor]:
        samples = random.sample(self.buffer, min(batch_size, len(self.buffer)))
        xs = torch.stack([s[0] for s in samples])
        ys = torch.stack([s[1] for s in samples])
        return xs, ys


class EWCRegularizer:
    """Elastic Weight Consolidation for anti-forgetting"""
    
    def __init__(self, model: nn.Module, lambda_ewc: float = 100):
        self.model = model
        self.lambda_ewc = lambda_ewc
        self.params = {n: p.clone().detach() for n, p in model.named_parameters()}
        self.fisher = {}
    
    def compute_fisher(self, dataloader, device, num_samples: int = 200):
        """Compute Fisher information matrix diagonal"""
        self.fisher = {n: torch.zeros_like(p) for n, p in self.model.named_parameters()}
        self.model.eval()
        
        for i, (x, y) in enumerate(dataloader):
            if i >= num_samples:
                break
            x, y = x.to(device), y.to(device)
            self.model.zero_grad()
            output = self.model(x)
            loss = nn.functional.cross_entropy(output, y)
            loss.backward()
            
            for n, p in self.model.named_parameters():
                if p.grad is not None:
                    self.fisher[n] += p.grad.data ** 2
        
        for n in self.fisher:
            self.fisher[n] /= num_samples
    
    def penalty(self) -> torch.Tensor:
        """Compute EWC penalty term"""
        loss = 0
        for n, p in self.model.named_parameters():
            if n in self.fisher:
                loss += (self.fisher[n] * (p - self.params[n]) ** 2).sum()
        return self.lambda_ewc * loss


class UserPatternLearner(nn.Module):
    """Continual learning model for user behavior patterns (per Mirzadeh recommendations)"""
    
    def __init__(self, input_dim: int, pattern_types: int = 32):
        super().__init__()
        # Wide, shallow architecture (width > depth)
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 512),
            nn.LayerNorm(512),  # NOT BatchNorm
            nn.ReLU(),
            nn.Linear(512, 512),
            nn.LayerNorm(512),
            nn.ReLU(),
        )
        self.pattern_head = nn.Linear(512, pattern_types)
        
        # Continual learning components
        self.replay_buffer = ReplayBuffer(max_size=5000)
        self.ewc = None
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        features = self.encoder(x)
        return self.pattern_head(features)
    
    def incremental_update(self, new_data: torch.Tensor, labels: torch.Tensor,
                          optimizer: torch.optim.Optimizer):
        """Update with anti-forgetting measures"""
        # Get replay samples
        if len(self.replay_buffer.buffer) > 0:
            replay_x, replay_y = self.replay_buffer.sample(len(new_data) // 2)
            combined_x = torch.cat([new_data, replay_x.to(new_data.device)])
            combined_y = torch.cat([labels, replay_y.to(labels.device)])
        else:
            combined_x, combined_y = new_data, labels
        
        # Forward pass
        optimizer.zero_grad()
        output = self.forward(combined_x)
        loss = nn.functional.cross_entropy(output, combined_y)
        
        # Add EWC penalty if not first task
        if self.ewc is not None:
            loss += self.ewc.penalty()
        
        loss.backward()
        optimizer.step()
        
        # Update replay buffer
        for x, y in zip(new_data[:10], labels[:10]):
            self.replay_buffer.add(x, y)
        
        return loss.item()
```

### Open source libraries

| Library | Best For | Install |
|---------|----------|---------|
| **Avalanche** | Comprehensive CL (20+ methods, benchmarks) | `pip install avalanche-lib` |
| **Continuum** | Data loading/scenario management | `pip install continuum` |
| **CL-Gym** | Training regime experimentation | GitHub: GMvandeVen/continual-learning |

---

## Predictive memory surfacing and temporal patterns

The **21-day habit formation** is a myth. Research (Lally et al., 2009, UCL) shows habit formation averages **66 days** with a range of 18-254 days. Design your pattern learning window accordingly.

### Temporal pattern detection algorithm

```python
import numpy as np
from scipy.fft import fft, ifft
from typing import Dict, List
from dataclasses import dataclass

@dataclass
class TemporalPattern:
    period_hours: int
    confidence: float
    pattern_type: str  # "daily", "weekly", "monthly"
    peak_times: List[int]

class TemporalPatternDetector:
    """O(n log n) periodicity detection via FFT-based autocorrelation"""
    
    PERIODS = {
        24: "daily",
        168: "weekly",    # 24 * 7
        720: "monthly"    # ~30 days
    }
    
    def __init__(self, min_confidence: float = 0.3):
        self.min_confidence = min_confidence
        self.learning_windows = {
            "initial": 21,   # Pattern detection starts
            "stable": 66,    # Per habit research
            "max": 90        # Rolling window cap
        }
    
    def detect_patterns(self, timestamps: List[float], 
                       values: List[float] = None) -> Dict[str, TemporalPattern]:
        """
        Detect daily, weekly, monthly patterns in user behavior.
        
        Args:
            timestamps: Unix timestamps of user events
            values: Optional intensity values (default: count-based)
        
        Returns:
            Dictionary of detected patterns by type
        """
        # Convert to hourly time series
        time_series = self._to_hourly_series(timestamps, values)
        n = len(time_series)
        
        if n < self.learning_windows["initial"] * 24:
            return {}  # Not enough data
        
        # Compute autocorrelation via FFT (O(n log n))
        fft_result = fft(time_series)
        acf = np.real(ifft(fft_result * np.conjugate(fft_result))) / n
        
        patterns = {}
        for period, pattern_type in self.PERIODS.items():
            if period < n and acf[0] > 0:
                confidence = acf[period] / acf[0]
                if confidence >= self.min_confidence:
                    peak_times = self._find_peak_times(time_series, period)
                    patterns[pattern_type] = TemporalPattern(
                        period_hours=period,
                        confidence=confidence,
                        pattern_type=pattern_type,
                        peak_times=peak_times
                    )
        
        return patterns
    
    def _to_hourly_series(self, timestamps: List[float], 
                         values: List[float] = None) -> np.ndarray:
        """Convert event timestamps to hourly binned time series"""
        if not timestamps:
            return np.array([])
        
        min_ts = min(timestamps)
        max_ts = max(timestamps)
        hours = int((max_ts - min_ts) / 3600) + 1
        series = np.zeros(hours)
        
        for i, ts in enumerate(timestamps):
            hour_idx = int((ts - min_ts) / 3600)
            series[hour_idx] += values[i] if values else 1
        
        return series
    
    def _find_peak_times(self, series: np.ndarray, period: int) -> List[int]:
        """Find peak activity times within the period"""
        # Fold time series at period length
        n_periods = len(series) // period
        folded = np.zeros(period)
        for i in range(n_periods):
            folded += series[i*period:(i+1)*period]
        folded /= n_periods
        
        # Find top 3 peak times
        peak_indices = np.argsort(folded)[-3:][::-1]
        return peak_indices.tolist()


class PredictiveContextSurface:
    """Anticipatory memory surfacing based on temporal patterns"""
    
    def __init__(self, memory_store, pattern_detector: TemporalPatternDetector):
        self.memory_store = memory_store
        self.detector = pattern_detector
        self.user_patterns: Dict[str, Dict] = {}
    
    async def get_anticipated_context(self, user_id: str, 
                                      current_time: float) -> List[dict]:
        """
        Predict and surface relevant memories before user asks.
        
        Returns memories likely needed based on:
        1. Temporal patterns (what does user need at this time?)
        2. Recency decay (recent memories more relevant)
        3. Historical co-occurrence (what memories appear together?)
        """
        patterns = self.user_patterns.get(user_id, {})
        
        hour_of_day = int((current_time % 86400) / 3600)
        day_of_week = int((current_time / 86400) % 7)
        
        # Score all user memories by temporal relevance
        memories = await self.memory_store.get_user_memories(user_id)
        scored_memories = []
        
        for mem in memories:
            score = 0.0
            
            # Daily pattern match
            if 'daily' in patterns:
                daily_pattern = patterns['daily']
                if hour_of_day in daily_pattern.peak_times:
                    score += daily_pattern.confidence * 0.4
            
            # Weekly pattern match
            if 'weekly' in patterns:
                weekly_pattern = patterns['weekly']
                weekly_hour = day_of_week * 24 + hour_of_day
                if weekly_hour in weekly_pattern.peak_times:
                    score += weekly_pattern.confidence * 0.3
            
            # Recency decay (exponential with 7-day half-life)
            age_days = (current_time - mem['last_accessed']) / 86400
            recency_score = np.exp(-age_days * np.log(2) / 7)
            score += recency_score * 0.3
            
            scored_memories.append({**mem, 'anticipation_score': score})
        
        # Return top 5 anticipated memories
        scored_memories.sort(key=lambda x: x['anticipation_score'], reverse=True)
        return scored_memories[:5]
```

### Prefetching strategy

```python
class MemoryPrefetcher:
    """Async prefetch anticipated memories to hot cache"""
    
    def __init__(self, redis_client, mongo_db, predictor: PredictiveContextSurface):
        self.redis = redis_client
        self.mongo = mongo_db
        self.predictor = predictor
        self.prefetch_queue = asyncio.Queue()
    
    async def prefetch_worker(self):
        """Background worker that prefetches predicted memories"""
        while True:
            user_id, current_time = await self.prefetch_queue.get()
            
            # Get predicted memories
            anticipated = await self.predictor.get_anticipated_context(
                user_id, current_time
            )
            
            # Prefetch to Redis hot cache
            pipe = self.redis.pipeline()
            for mem in anticipated:
                key = f"memory:{user_id}:{mem['id']}"
                pipe.hset(key, mapping={
                    'content': mem['content'],
                    'importance': mem['importance'],
                    'prefetched': 'true'
                })
                pipe.expire(key, 3600)  # 1 hour TTL
            
            await pipe.execute()
    
    async def schedule_prefetch(self, user_id: str):
        """Schedule prefetch for upcoming session"""
        current_time = time.time()
        await self.prefetch_queue.put((user_id, current_time))
```

---

## Zipfian cache hierarchy implementation

Zipfian (power-law) distribution means ~20% of memories serve ~80% of requests. Design tiers accordingly:

| Tier | Storage | Latency | TTL Base | Promotion Threshold |
|------|---------|---------|----------|---------------------|
| **Hot** | Redis | <1ms | 1 hour | >10 accesses/hour |
| **Warm** | MongoDB | ~5ms | 7 days | >1 access/day |
| **Cold** | S3 | ~100ms | 1 year | Archive after 7 days |

### Complete tier manager

```python
import asyncio
import time
from dataclasses import dataclass
from typing import Optional, Literal
import json

@dataclass
class TierConfig:
    hot_threshold: int = 10      # accesses/hour for hot
    warm_threshold: int = 1      # accesses/day for warm
    hot_ttl: int = 3600          # 1 hour
    warm_ttl: int = 604800       # 7 days
    cold_ttl: int = 31536000     # 1 year

class ZipfianTierManager:
    """Hot/Warm/Cold memory tier management following Zipfian distribution"""
    
    def __init__(self, redis_client, mongo_db, s3_client, weaviate_client,
                 config: TierConfig = None):
        self.redis = redis_client
        self.mongo = mongo_db
        self.s3 = s3_client
        self.weaviate = weaviate_client
        self.config = config or TierConfig()
        self.freq_tracker = FrequencyTracker(redis_client)
    
    async def get_memory(self, user_id: str, memory_id: str) -> Optional[dict]:
        """
        Retrieve memory with automatic tier promotion.
        Tries Hot → Warm → Cold, promotes on access.
        """
        key = f"memory:{user_id}:{memory_id}"
        
        # Try hot tier (Redis)
        data = await self.redis.hgetall(key)
        if data:
            await self.freq_tracker.track(memory_id)
            return self._decode_memory(data)
        
        # Try warm tier (MongoDB)
        doc = await self.mongo.memories.find_one({
            "user_id": user_id, 
            "memory_id": memory_id
        })
        if doc:
            await self.freq_tracker.track(memory_id)
            await self._maybe_promote_to_hot(doc)
            return doc
        
        # Try cold tier (S3)
        try:
            response = await self.s3.get_object(
                Bucket='memorable-cold',
                Key=f"{user_id}/{memory_id}.json"
            )
            data = json.loads(response['Body'].read())
            await self.freq_tracker.track(memory_id)
            await self._promote_to_warm(data)
            return data
        except self.s3.exceptions.NoSuchKey:
            return None
    
    async def store_memory(self, memory: dict, tier: Literal["hot", "warm", "cold"] = "warm"):
        """Store memory in specified tier with cross-store sync"""
        user_id = memory['user_id']
        memory_id = memory['memory_id']
        
        if tier == "hot":
            # Store in Redis
            key = f"memory:{user_id}:{memory_id}"
            await self.redis.hset(key, mapping=self._encode_memory(memory))
            await self.redis.expire(key, self.config.hot_ttl)
        
        # Always store in MongoDB (source of truth)
        await self.mongo.memories.update_one(
            {"user_id": user_id, "memory_id": memory_id},
            {"$set": {**memory, "tier": tier}},
            upsert=True
        )
        
        # Store vector in Weaviate
        await self._store_vector(memory)
        
        if tier == "cold":
            # Also store in S3 for durability
            await self.s3.put_object(
                Bucket='memorable-cold',
                Key=f"{user_id}/{memory_id}.json",
                Body=json.dumps(memory)
            )
    
    async def _maybe_promote_to_hot(self, memory: dict):
        """Promote to hot if access frequency exceeds threshold"""
        freq = await self.freq_tracker.get_frequency(memory['memory_id'])
        if freq >= self.config.hot_threshold:
            key = f"memory:{memory['user_id']}:{memory['memory_id']}"
            await self.redis.hset(key, mapping=self._encode_memory(memory))
            await self.redis.expire(key, self.config.hot_ttl)
            
            # Update tier in MongoDB
            await self.mongo.memories.update_one(
                {"memory_id": memory['memory_id']},
                {"$set": {"tier": "hot"}}
            )
    
    async def demote_stale_memories(self):
        """Periodic job to demote underused memories"""
        now = time.time()
        
        # Demote hot → warm (not accessed in 1 hour)
        async for key in self.redis.scan_iter("memory:*"):
            last_access = await self.redis.hget(key, 'last_accessed')
            if last_access and now - float(last_access) > self.config.hot_ttl:
                # Move to warm only (already in MongoDB)
                await self.redis.delete(key)
        
        # Demote warm → cold (not accessed in 7 days)
        stale_cursor = self.mongo.memories.find({
            "tier": "warm",
            "last_accessed": {"$lt": now - self.config.warm_ttl}
        })
        
        async for doc in stale_cursor:
            # Archive to S3
            await self.s3.put_object(
                Bucket='memorable-cold',
                Key=f"{doc['user_id']}/{doc['memory_id']}.json",
                Body=json.dumps(doc, default=str)
            )
            # Update tier
            await self.mongo.memories.update_one(
                {"_id": doc['_id']},
                {"$set": {"tier": "cold"}}
            )


class FrequencyTracker:
    """Sliding window frequency counter using Redis Sorted Sets"""
    
    def __init__(self, redis_client, window_seconds: int = 3600):
        self.redis = redis_client
        self.window = window_seconds
    
    async def track(self, memory_id: str):
        now = time.time()
        key = f"freq:{memory_id}"
        
        await self.redis.zadd(key, {str(now): now})
        await self.redis.zremrangebyscore(key, 0, now - self.window)
        await self.redis.expire(key, self.window * 2)
    
    async def get_frequency(self, memory_id: str) -> int:
        now = time.time()
        return await self.redis.zcount(f"freq:{memory_id}", now - self.window, now)
```

### MongoDB schema with indexes

```javascript
// Memory collection schema
{
  "_id": "ObjectId",
  "memory_id": "string (UUID)",
  "user_id": "string",
  "content": "string",
  "summary": "string",
  "importance": "float (0-1)",
  "access_count": "int",
  "created_at": "ISODate",
  "last_accessed": "ISODate",
  "tier": "string (hot|warm|cold)",
  "tags": ["string"],
  "vector_ref": "string (Weaviate UUID)",
  "temporal_metadata": {
    "hour_pattern": "int (0-23)",
    "day_pattern": "int (0-6)",
    "pattern_confidence": "float"
  }
}

// Indexes
db.memories.createIndex({"user_id": 1, "last_accessed": -1})
db.memories.createIndex({"user_id": 1, "tier": 1, "importance": -1})
db.memories.createIndex({"user_id": 1, "tags": 1})
db.memories.createIndex(
  {"last_accessed": 1}, 
  {expireAfterSeconds: 7776000, partialFilterExpression: {"tier": "warm"}}
)
```

---

## MCP server integration for predictive memory

The Model Context Protocol (MCP) is the optimal interface for exposing memoRable's capabilities to LLM applications.

### Recommended MCP tool interface

```typescript
// memoRable MCP Server - Tool Definitions
const MEMORABLE_TOOLS = [
  {
    name: "store_memory",
    description: "Store a new memory with optional predictive hints",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Memory content" },
        tags: { type: "array", items: { type: "string" } },
        importance: { type: "number", minimum: 0, maximum: 1 },
        predictive_hints: {
          type: "object",
          properties: {
            trigger_topics: { type: "array", items: { type: "string" } },
            temporal_relevance: { 
              type: "string", 
              enum: ["ephemeral", "short-term", "long-term", "permanent"] 
            }
          }
        }
      },
      required: ["content"]
    }
  },
  {
    name: "search_memories",
    description: "Semantic search across stored memories",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", default: 10 },
        filters: {
          type: "object",
          properties: {
            tags: { type: "array", items: { type: "string" } },
            min_importance: { type: "number" },
            time_range: {
              type: "object",
              properties: {
                from: { type: "string", format: "date-time" },
                to: { type: "string", format: "date-time" }
              }
            }
          }
        }
      },
      required: ["query"]
    }
  },
  {
    // CRITICAL: This is the predictive surfacing tool
    name: "get_anticipated_context",
    description: "Get predictively relevant memories for current context. Call at conversation start.",
    inputSchema: {
      type: "object",
      properties: {
        current_context: { type: "string", description: "Current conversation context" },
        user_intent: { type: "string", description: "Inferred user goal" },
        max_memories: { type: "integer", default: 5 }
      },
      required: ["current_context"]
    },
    outputSchema: {
      type: "object",
      properties: {
        anticipated_memories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              content: { type: "string" },
              relevance_score: { type: "number" },
              relevance_reason: { type: "string" }
            }
          }
        }
      }
    }
  },
  {
    name: "forget_memory",
    description: "Permanently delete a memory",
    annotations: { destructiveHint: true },
    inputSchema: {
      type: "object",
      properties: { memory_id: { type: "string" } },
      required: ["memory_id"]
    }
  }
];
```

### TypeScript MCP server implementation

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({
  name: "memorable-memory-server",
  version: "1.0.0"
}, {
  capabilities: { tools: {}, resources: {} }
});

// Tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case "get_anticipated_context": {
      // This is where predictive surfacing happens
      const memories = await predictiveEngine.getAnticipatedContext(
        args.current_context,
        args.user_intent,
        args.max_memories
      );
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            anticipated_memories: memories.map(m => ({
              id: m.id,
              content: m.content,
              relevance_score: m.anticipation_score,
              relevance_reason: `Temporal pattern match: ${m.pattern_type || 'semantic'}`
            }))
          })
        }]
      };
    }
    case "store_memory": {
      const memory = await tierManager.store_memory({
        content: args.content,
        tags: args.tags || [],
        importance: args.importance || 0.5,
        user_id: getCurrentUserId(),
        memory_id: generateUUID()
      });
      return { content: [{ type: "text", text: JSON.stringify(memory) }] };
    }
    // ... other tool handlers
  }
});

// Resource for proactive context (application-controlled)
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "memory://context/anticipated",
      name: "Anticipated Context",
      description: "Auto-refreshed relevant memories based on patterns",
      mimeType: "application/json"
    },
    {
      uri: "memory://user/profile",
      name: "User Profile",
      description: "Persistent user preferences and facts"
    }
  ]
}));

const transport = new StdioServerTransport();
await server.connect(transport);
```

### System prompt for predictive surfacing

```
At the start of each conversation, call get_anticipated_context with the 
user's first message to retrieve predictively relevant memories. Use these 
to provide personalized, context-aware responses without requiring the user 
to repeat information.
```

---

## Competitive analysis and differentiation

### Feature gap analysis

| Capability | Mem0 | AWS AgentCore | Zep | Letta | memoRable (Target) |
|------------|------|---------------|-----|-------|-------------------|
| **Predictive surfacing** | ❌ | ⚠️ Basic | ❌ | ⚠️ Sleep-time | ✅ Full temporal patterns |
| **O(1) pattern lookup** | ❌ | ❌ | ❌ | ❌ | ✅ Engram-style hashing |
| **Zipfian cache hierarchy** | ❌ | ❌ | ❌ | ❌ | ✅ Hot/Warm/Cold tiers |
| **Context-aware gating** | ❌ | ❌ | ❌ | ✅ Self-editing | ✅ Neural gating |
| **Continual learning** | ⚠️ Versioning | ⚠️ Episodic | ⚠️ Temporal | ✅ Sleep-time | ✅ EWC + Replay |
| **Temporal patterns** | ❌ | ⚠️ | ✅ Bi-temporal | ❌ | ✅ FFT detection |
| **Graph memory** | 💰 Pro only | ❌ | ✅ Core | ⚠️ | ✅ |
| **Self-hosted** | ✅ | ❌ | ⚠️ | ✅ | ✅ |

### memoRable differentiation opportunities

1. **True anticipatory surfacing** — No competitor proactively predicts needed context using temporal behavior patterns
2. **O(1) Engram-style lookup** — All competitors rely on O(log n) or O(n) vector search
3. **Integrated cache hierarchy** — No competitor implements Zipfian-optimized tiering
4. **Neural context gating** — Only Letta has self-editing; none have learned suppression
5. **Production continual learning** — Most rely on simple versioning, not anti-forgetting algorithms

### API pattern recommendations from competitors

**From Mem0** (simplicity):
```python
memory.add(messages, user_id=user_id)
memories = memory.search(query, user_id, limit=3)
```

**From Zep** (temporal queries):
```python
memory.search(query, valid_at="2025-01-15T00:00:00Z")
```

**From Letta** (agent-managed memory):
```python
agent.tools = ["core_memory_append", "archival_memory_search"]
```

---

## Implementation roadmap

### Phase 1: Foundation (Weeks 1-4)
1. MongoDB schema + indexes for memory storage
2. Redis hot cache with frequency tracking
3. Weaviate vector schema with MongoDB cross-references
4. Basic MCP server with store/search tools

### Phase 2: Predictive Core (Weeks 5-8)
1. Temporal pattern detector (FFT-based)
2. Anticipatory context surfacing
3. Memory prefetcher with async queue
4. `get_anticipated_context` MCP tool

### Phase 3: Advanced Memory (Weeks 9-12)
1. Multi-head Engram hashing for patterns
2. Context-aware gating (threshold → neural)
3. Zipfian tier manager with auto promotion/demotion
4. Continual learning pipeline (EWC + Replay)

### Phase 4: Production Hardening (Weeks 13-16)
1. Cross-database consistency (Change Streams)
2. Memory consolidation/decay jobs
3. Comprehensive MCP resources and prompts
4. Monitoring and observability

---

## Key implementation files structure

```
memorable/
├── core/
│   ├── engram/
│   │   ├── multi_head_hash.py      # K=8 hashing
│   │   ├── tokenizer_compressor.py # Vocabulary compression
│   │   └── context_gate.py         # Neural gating
│   ├── temporal/
│   │   ├── pattern_detector.py     # FFT-based detection
│   │   ├── predictor.py            # Anticipatory surfacing
│   │   └── prefetcher.py           # Async prefetch
│   └── learning/
│       ├── replay_buffer.py        # Experience replay
│       ├── ewc.py                  # Elastic weight consolidation
│       └── pattern_learner.py      # User pattern model
├── storage/
│   ├── tier_manager.py             # Zipfian cache hierarchy
│   ├── mongo_store.py              # MongoDB operations
│   ├── redis_cache.py              # Redis hot tier
│   ├── weaviate_vectors.py         # Vector storage
│   └── s3_cold.py                  # Cold archive
├── mcp/
│   ├── server.py                   # MCP server
│   ├── tools.py                    # Tool definitions
│   └── resources.py                # Resource definitions
└── config/
    ├── schemas/
    │   ├── mongo_schema.json
    │   └── weaviate_schema.json
    └── tier_config.yaml
```

This architecture positions memoRable to be the first memory system with true predictive capabilities, combining frontier research (Engram, continual learning) with production-ready infrastructure (Zipfian caching, MCP integration).