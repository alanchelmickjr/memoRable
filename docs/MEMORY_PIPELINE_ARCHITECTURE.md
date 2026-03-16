# Memory Pipeline Architecture

## The Data Flow — From Raw Input to Recalled Memory

Every memory that enters MemoRable passes through a pipeline that transforms raw text into searchable, scored, contextualized knowledge. No mocks. No placeholders. Real data at every stage.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MEMORY PIPELINE — END TO END                        │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌────────────┐
  │  CLIENT  │────▶│  MCP SERVER  │────▶│  INGESTION   │────▶│  MONGODB   │
  │          │     │  (37 tools)  │     │  PIPELINE    │     │  ATLAS     │
  │ Claude   │◀────│              │◀────│              │◀────│            │
  │ Code     │     │ Port: 8080   │     │ Port: 8001   │     │ (Cloud)    │
  └──────────┘     └──────┬───────┘     └──────┬───────┘     └─────┬──────┘
                          │                    │                   │
                          │                    ▼                   │
                          │            ┌──────────────┐            │
                          │            │  EMBEDDING   │            │
                          │            │  SERVICE     │            │
                          │            │              │            │
                          │            │ Ollama ──────┤            │
                          │            │ (nomic-embed │            │
                          │            │  -text, 768d)│            │
                          │            │              │            │
                          │            │ Hash fallback│            │
                          │            │ (SHA-512 +   │            │
                          │            │  trigrams)   │            │
                          │            │              │            │
                          │            │ Port: 3003   │            │
                          │            └──────────────┘            │
                          │                                       │
                          ▼                                       ▼
                   ┌──────────────┐                     ┌──────────────┐
                   │  RETRIEVAL   │◀───────────────────▶│ ATLAS VECTOR │
                   │  SERVICE     │                     │ SEARCH INDEX │
                   │              │                     │              │
                   │ Vector search│                     │ $vectorSearch│
                   │ Text search  │                     │ cosine sim   │
                   │ Salience rank│                     │              │
                   │              │                     └──────────────┘
                   │ Port: 3004   │
                   └──────────────┘


  ┌─────────────────────────────────────────────────────────────────────────┐
  │                        SALIENCE ENGINE (CORE)                          │
  │                                                                       │
  │  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌───────────┐  │
  │  │EMOTIONAL│  │ NOVELTY │  │RELEVANCE │  │ SOCIAL │  │CONSEQUENT.│  │
  │  │  30%    │  │  20%    │  │  20%     │  │  15%   │  │   15%     │  │
  │  └────┬────┘  └────┬────┘  └────┬─────┘  └───┬────┘  └─────┬─────┘  │
  │       └────────────┼───────────┼──────────────┼─────────────┘        │
  │                    ▼           ▼              ▼                       │
  │              ┌──────────────────────────┐                             │
  │              │    SALIENCE SCORE        │                             │
  │              │    (0-100)               │                             │
  │              └──────────┬───────────────┘                             │
  │                         ▼                                             │
  │  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
  │  │ TEMPORAL │  │ OPEN LOOP    │  │ RELATIONSHIP │  │ CONTEXT     │  │
  │  │ DECAY    │  │ TRACKER      │  │ INTELLIGENCE │  │ GATE        │  │
  │  │          │  │              │  │              │  │             │  │
  │  │ Time     │  │ Commitments  │  │ Social graph │  │ Right memory│  │
  │  │ fades    │  │ deadlines    │  │ prediction   │  │ right time  │  │
  │  │ memories │  │ follow-ups   │  │ timeline     │  │ right place │  │
  │  └──────────┘  └──────────────┘  └──────────────┘  └─────────────┘  │
  └─────────────────────────────────────────────────────────────────────┘


  ┌─────────────────────────────────────────────────────────────────────────┐
  │                     SECURITY TIERS — PRIVACY FIRST                     │
  │                                                                       │
  │  Tier 1: General          Tier 2: Personal         Tier 3: Vault      │
  │  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐   │
  │  │ External LLM │         │ Local LLM    │         │ Heuristic    │   │
  │  │ OK           │         │ only (Ollama)│         │ ONLY         │   │
  │  │              │         │              │         │              │   │
  │  │ "what movie" │         │ "my birthday"│         │ "grandma's   │   │
  │  │              │         │              │         │  credit card"│   │
  │  └──────────────┘         └──────────────┘         └──────────────┘   │
  │                                                                       │
  │  Tier2/3: Content encrypted at rest. Tier3: NEVER touches any LLM.   │
  └─────────────────────────────────────────────────────────────────────────┘
```

## Store Flow (store_memory)

```
Client sends text
       │
       ▼
1. MCP Server receives via store_memory tool
       │
       ▼
2. Security tier classification (Tier1/2/3)
       │
       ▼
3. Feature extraction (LLM or heuristic, based on tier)
   ├── Topics, entities, people mentioned
   ├── Sentiment, emotion intensity
   ├── Urgency/directive detection
   └── Open loop detection (commitments, deadlines)
       │
       ▼
4. Salience scoring (5-component weighted)
   └── emotion(30%) + novelty(20%) + relevance(20%) + social(15%) + consequential(15%)
       │
       ▼
5. Embedding generation
   ├── Primary: Ollama nomic-embed-text (768 dims)
   └── Fallback: SHA-512 + trigram hash (deterministic, content-sensitive)
       │
       ▼
6. Store to MongoDB Atlas
   ├── Document: text, salience, features, tier, timestamp
   ├── Vector: embedding field (for Atlas $vectorSearch)
   └── Tier2/3: content encrypted before storage
```

## Recall Flow (recall)

```
Client sends query
       │
       ▼
1. MCP Server receives via recall tool
       │
       ▼
2. Query embedding generated (same model as store)
       │
       ▼
3. Search strategy (cascading):
   ├── Try: MongoDB Atlas $vectorSearch (best — real semantic similarity)
   ├── Fall back: Text regex + stored embedding cosine similarity
   └── Last resort: Text regex + term match ratio scoring
       │
       ▼
4. Salience-weighted re-ranking
   └── retrieval_score = similarity * 0.6 + (salience/100) * decay * 0.4
       │
       ▼
5. Context gate filtering
   ├── Location relevance
   ├── Activity relevance
   └── People in current context
       │
       ▼
6. Return ranked memories to client
```

## Embedding Strategy

| Priority | Model | Dimensions | Source | When |
|----------|-------|-----------|--------|------|
| 1 | nomic-embed-text | 768 | Ollama (Docker) | Ollama available |
| 2 | Hash-deterministic | 768 | Local (SHA-512 + trigrams) | Ollama down |

The hash fallback is **not random** — it uses cryptographic hashing with overlapping trigrams so that similar texts produce similar vectors. It's deterministic: same input always produces same output. Not as good as a trained model, but provides real similarity signal.

MongoDB Atlas Vector Search requires a vector index on the `embedding` field. When available, it provides sub-millisecond cosine similarity search. When not indexed, the retrieval service computes cosine similarity in application code against stored vectors.

## Configuration

All via environment variables (see `.env.example`):

```
OLLAMA_HOST=http://ollama:11434      # Ollama API endpoint
EMBEDDING_MODEL=nomic-embed-text     # HuggingFace model name
EMBEDDING_DIMENSION=768              # Vector dimensions
EMBEDDING_TIMEOUT_MS=30000           # Embedding request timeout
EMBEDDING_SERVICE_URL=http://embedding_service:3003
RETRIEVAL_SERVICE_PORT=3004
NARRATIVE_MAX_CHARS=4096             # Max text length for embedding
```
