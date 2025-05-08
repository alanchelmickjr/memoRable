# MemoRable - Total Recall: Technical Architecture

## 1. Introduction

MemoRable - Total Recall is an advanced AI memory system designed to provide agents with comprehensive, contextually rich, and adaptive recall capabilities. This document outlines the system architecture, detailing its components, data flows, service boundaries, and operational considerations. It builds upon the foundational concepts in the project's [`README.md`](../README.md), [`memoRable_implementation_plan.md`](../memoRable_implementation_plan.md), and is primarily derived from the detailed specifications in [`docs/total_recall_specification.md`](./total_recall_specification.md).

The architecture adheres to the **Universal Vectorization Principle**, ensuring all incoming data is initially vectorized and stored comprehensively. It employs a microservices-based approach, containerized with Docker, and emphasizes modularity, scalability, and security.

## 2. Core Architectural Principles

*   **Context as a First-Class Citizen**: Rich, interwoven contexts (temporal, spatial, emotional, reasoning) are central to memory representation and retrieval.
*   **Memory-Derived Identity & Personality**: Agent coherence and personality emerge from accumulated, processed, and synthesized memories.
*   **Adaptive Ingestion & Schema**: The system learns and adapts its data capture and schema based on the evolving relevance and utility of information, primarily driven by the "Nocturnal Nurturing & Network Attunement" (NNNA) process.
*   **Dual-Model Memory Architecture**: A "Subconscious Scanner" model (e.g., Gemini) continuously processes long-term memory, while a "Conscious Access Model" handles immediate retrieval needs, leveraging insights from the scanner. This mimics human cognitive depth and efficiency.
*   **Dual Storage Strategy**:
    *   **MongoDB**: Primary store for complete, structured "Memory Mementos" and journaling.
    *   **Weaviate**: Vector database for semantic search and similarity-based retrieval of embeddings.
*   **Microservices & Dockerization**: Components are designed as independent services, orchestrated by Docker Compose for development, testing, and deployment flexibility.
*   **Alliterative Naming**: Components and concepts utilize alliterative names for clarity and memorability (e.g., "Embedding Essence," "Conscious Current").
*   **Security by Design**: Security considerations are integrated throughout the architecture, from data handling to API access.

## 3. High-Level System Diagram

```mermaid
graph LR
    subgraph UserInteraction["User Interaction Layer"]
        UI[User/Agent Interface]
    end

    subgraph ProcessingCore["MemoRable Processing Core"]
        direction LR
        CAM[Conscious Access Model / Conscious Current]
        SSM[Subconscious Scanner Model (Gemini Target) - NNNA and Subconscious Synthesis]
        IP[Input Processor / Ingestion Infinity-Loop]
        CP[Contextual Processor]
        EP[Emotional Processor]
        AS[Attention System]
        EmbServ[Embedding Essence]
    end

    subgraph MemoryStorage["Three-Tier Memory Storage"]
        direction TB
        Redis[Redis (Active Memory Buffer)]
        Weaviate[Weaviate (Vector Embeddings)]
        MongoDB[MongoDB (Raw Data & Journals)]
    end

    UI --> IP
    IP --> CAM
    IP --> CP
    IP --> EP
    IP -- Prepared Narrative --> EmbServ
    EmbServ -- Embedding Vector --> Weaviate
    IP -- Raw Memento --> MongoDB

    CP --> CAM
    EP --> CAM
    
    CAM <--> AS
    AS <--> SSM
    
    CAM -- Query for Retrieval --> EmbServ
    EmbServ -- Query Vector --> Weaviate
    Weaviate -- Memento IDs --> CAM
    CAM -- Fetch Full Mementos --> MongoDB
    MongoDB -- Full Mementos --> CAM
    CAM -- Relevant Memories --> UI
    
    SSM -- Reads/Updates --> Weaviate
    SSM -- Reads/Updates --> MongoDB
    SSM -- Schema Feedback --> IP
    SSM -- Personality Insights & Profile --> CAM

    Redis -- Cache For --> CAM
    CAM -- Access/Store --> Redis


    style UserInteraction fill:#D5F5E3,stroke:#2ECC71
    style ProcessingCore fill:#EBF5FB,stroke:#3498DB
    style MemoryStorage fill:#FDEDEC,stroke:#E74C3C
    style IP fill:#f9f,stroke:#333,stroke-width:2px
    style EmbServ fill:#ccf,stroke:#333,stroke-width:2px
    style SSM fill:#cfc,stroke:#333,stroke-width:2px
    style CAM fill:#ffc,stroke:#333,stroke-width:2px
    style UI fill:#cff,stroke:#333,stroke-width:2px
    style Weaviate fill:#e6e6fa,stroke:#333,stroke-width:2px
    style MongoDB fill:#add8e6,stroke:#333,stroke-width:2px
    style Redis fill:#f5b7b1,stroke:#333,stroke-width:2px
```

**Data Flow Summary:**

1.  **Input & Initial Processing**: The `User/Agent Interface` sends data to the `Input Processor` (`Ingestion Infinity-Loop`). The `Input Processor` handles initial data preparation, including calls to `Contextual Processor` and `Emotional Processor`.
2.  **Memento Creation & Storage**:
    *   The `Input Processor` sends the raw/structured "Memory Memento" to `MongoDB` for persistent storage.
    *   A prepared narrative from the `Input Processor` is sent to `Embedding Essence` to generate a vector embedding.
    *   The `Embedding Essence` service returns the vector, which is then stored in `Weaviate` along with the `mementoId` linking it to the full memento in `MongoDB`.
3.  **Conscious Retrieval**:
    *   The `User/Agent Interface` sends a query context to the `Conscious Access Model` (`Conscious Current`).
    *   The `Conscious Access Model` formulates a query narrative and sends it to `Embedding Essence` to get a query vector.
    *   This vector is used to search `Weaviate` for relevant `mementoId`s.
    *   The `Conscious Access Model` retrieves the full mementos from `MongoDB` using these IDs.
    *   Relevant memories are returned to the `User/Agent Interface`.
    *   `Redis` is used by the `Conscious Access Model` as an active memory buffer/cache for frequently accessed data.
4.  **Subconscious Processing & Synthesis**:
    *   The `Subconscious Scanner Model` (`NNNA` & `Subconscious Synthesis` components) continuously reads from and updates `MongoDB` and `Weaviate`.
    *   It refines memories, updates embeddings (potentially via `Embedding Essence`), generates personality insights, and provides schema adaptation feedback to the `Input Processor`.
    *   Personality insights and profiles derived by the `Subconscious Scanner Model` are made available to the `Conscious Access Model` to influence retrieval and agent behavior.
5.  **Attention & Model Interaction**: The `Attention System` facilitates the interaction and information flow between the `Conscious Access Model` and the `Subconscious Scanner Model`, ensuring relevant information is prioritized and surfaced efficiently.

## 4. Service Boundaries and APIs

Each service is designed as a distinct microservice, containerized via Docker, with clearly defined responsibilities and communication interfaces. REST APIs are preferred for inter-service communication, with potential for gRPC for performance-critical paths or message queues (e.g., RabbitMQ, Kafka) for asynchronous tasks like ingestion.

### 4.1. Input Sources / Adapters
*   **Responsibilities**: Collect data from various origins (text, Git, audio transcripts, etc.) and forward it to the Ingestion Service.
*   **Interface**: Specific to the source (e.g., Git hook listener, message queue consumer, API endpoint for direct submission).
*   **Output**: Standardized raw data format for the Ingestion Service.

### 4.2. Ingestion Infinity-Loop (Ingestion Service)
*   **Responsibilities**:
    *   Receive raw data from various input sources.
    *   Preprocess data (normalization, entity extraction, emotional analysis via `HumeService` or similar).
    *   Construct "Memory Memento" objects based on the current adaptive schema.
    *   Coordinate with `Embedding Essence` to generate embeddings.
    *   Store full mementos in MongoDB and ensure vector/metadata storage in Weaviate (handling transactional consistency).
    *   Adapt to schema changes signaled by NNNA.
*   **Primary API Endpoints**:
    *   `POST /ingest`: Submits new data for processing. Accepts various content types.
        *   Payload: `{ "sourceSystem": "...", "sourceIdentifier": "...", "contentType": "...", "contentRaw": "...", "eventTimestamp": "...", ... }`
        *   Response: `202 Accepted` (acknowledges receipt for processing) or error.
*   **Internal Communication**:
    *   Calls `Embedding Essence` to get vectors.
    *   Writes to MongoDB and Weaviate.
    *   Listens for schema update notifications (e.g., via a dedicated internal API or message queue from NNNA).

### 4.3. Embedding Essence (Embedding Service)
*   **Responsibilities**:
    *   Generate vector embeddings for "Memory Memento" narratives and query narratives using a configured model (e.g., OpenAI `text-embedding-3-large`, local Sentence Transformers via Ollama).
    *   Manage interaction with the chosen embedding model provider (API calls, local model serving).
    *   Provide an interface for embedding text.
*   **Primary API Endpoints**:
    *   `POST /embed`: Generates an embedding for a given text narrative.
        *   Payload: `{ "narrativeText": "..." }`
        *   Response: `{ "embeddingVector": [...] }` or error.
*   **Dependencies**: Access to embedding models (OpenAI API key, Ollama endpoint).

### 4.4. Weaviate Vector Database
*   **Responsibilities**: Store and index vector embeddings of Memory Mementos along with key filterable metadata. Enable efficient semantic search.
*   **Interface**: Weaviate's native API (GraphQL, REST).

### 4.5. MongoDB (Document Depository & Journaling)
*   **Responsibilities**: Store complete, structured "Memory Memento" objects. Store agent personality profiles, journaling data, and operational logs.
*   **Interface**: MongoDB's native driver/protocol.

### 4.6. Nocturnal Nurturing & Network Attunement (NNNA - Nightly Processing Service)
*   **Responsibilities**:
    *   Perform nightly analysis of mementos in MongoDB and Weaviate.
    *   Re-evaluate relevance, correct/enrich mementos, update causal links.
    *   Trigger re-embedding of mementos via `Embedding Essence` if narratives or understanding changes.
    *   Identify patterns for personality trait derivation (feeding `Subconscious Synthesis`).
    *   Propose and manage "Schema Adaptation" for the `Ingestion Infinity-Loop`.
    *   Manage data archival and pruning.
*   **Triggers**: Typically time-based (e.g., cron job within its Docker container) or event-driven (e.g., after a certain volume of new data).
*   **Data Access**: Direct read/write access to MongoDB and Weaviate.
*   **Output**: Updates to mementos, new "insight" mementos, schema update notifications, personality data.
*   **API (Internal/Control)**:
    *   `POST /nnna/trigger`: Manually trigger a processing cycle.
    *   `GET /nnna/status`: Check status of ongoing/last processing.

### 4.7. Conscious Current (Contextual Retrieval Service)
*   **Responsibilities**:
    *   Receive the agent's current operational context (active task, recent interactions, emotional state).
    *   Formulate a "Contextual Narrative for Query."
    *   Generate a query vector via `Embedding Essence`.
    *   Query Weaviate for semantically similar `mementoId`s.
    *   Fetch full mementos from MongoDB using these IDs.
    *   Re-rank and filter retrieved mementos.
    *   Provide the "driving window of context" (top N mementos) to the `Agent Interface`.
*   **Primary API Endpoints**:
    *   `POST /retrieve`: Retrieves relevant memories based on current context.
        *   Payload: `{ "agentId": "...", "currentContext": { "activeTask": "...", "recentInteractions": "...", ... }, "retrievalOptions": { "limit": 10, "minCertainty": 0.7 } }`
        *   Response: `{ "retrievedMementos": [...] }` or error.
*   **Internal Communication**: Calls `Embedding Essence`, queries Weaviate, queries MongoDB.

### 4.8. Subconscious Synthesis (Personality Service)
*   **Responsibilities**:
    *   Store and manage the agent's "Personality Profile" derived from NNNA insights.
    *   Provide the personality profile to other services (e.g., `Agent Interface`, `Conscious Current`) to influence behavior, retrieval, and response generation.
*   **Primary API Endpoints**:
    *   `GET /personality/{agentId}`: Retrieves the personality profile for an agent.
        *   Response: `{ "dominantTraits": [...], "cognitiveStyles": [...], ... }`
    *   `PUT /personality/{agentId}` (Internal, used by NNNA): Updates the personality profile.
*   **Data Access**: Reads/writes personality profiles in MongoDB.

### 4.9. Agent Interface
*   **Responsibilities**:
    *   Represents the AI agent's core logic or the application integrating MemoRable.
    *   Constructs the `currentAgentContext` for retrieval.
    *   Receives retrieved memories from `Conscious Current`.
    *   Utilizes memories and personality profile (from `Subconscious Synthesis`) to inform actions, decisions, and responses.
*   **Interface**: Consumes APIs of `Conscious Current` and `Subconscious Synthesis`.

## 5. Data Models & Schemas (High-Level)

Refer to [`docs/total_recall_specification.md#1-memory-item-structure-memory-memento`](./total_recall_specification.md#1-memory-item-structure-memory-memento) for the detailed `MemoryMemento` structure.

### 5.1. Weaviate Class: `MemoryMemento` (or `MementoVector`)
*   **Properties**:
    *   `mementoId`: (string, keyword) - Primary link to MongoDB.
    *   `agentId`: (string, keyword, indexFilterable: true)
    *   `creationTimestamp`: (date, indexFilterable: true)
    *   `eventTimestamp`: (date, indexFilterable: true)
    *   `contentType`: (string, keyword, indexFilterable: true)
    *   `tags`: (string[], keyword, indexFilterable: true)
    *   `dominantEmotion`: (string, keyword, indexFilterable: true)
    *   `sourceSystem`: (string, keyword, indexFilterable: true)
    *   `schemaVersion`: (string, keyword, indexFilterable: true)
*   **Vectorization**: `vectorizer: none` (externally provided embeddings). `vectorIndexType: hnsw`. `distance: cosine`.
*   **Schema Evolution**: Managed by NNNA. Updates may require data migration or re-indexing, coordinated by NNNA. Weaviate's schema update capabilities will be used. The `schemaVersion` property on objects helps manage this.

### 5.2. MongoDB Collections
*   **`memory_mementos`**:
    *   Stores the full `MemoryMemento` JSON object, as detailed in the specification.
    *   Indexed fields: `mementoId` (unique), `agentId`, `creationTimestamp`, `temporalContext.eventTimestamp`, `tags` (multikey), `emotionalContext.dominantEmotion`, `contentType`, `sourceSystem`, `schemaVersion`.
*   **`agent_personality_profiles`**:
    *   Stores derived personality traits for each agent.
    *   Schema: `{ "agentId": "<UUID>", "profileVersion": "...", "lastUpdated": ISODate("..."), "dominantTraits": [...], "cognitiveStyles": [...], "interactionPreferences": [...], ... }`
*   **`system_journals`**:
    *   Stores logs of NNNA activities, schema changes, significant system events.
*   **Schema Evolution**: MongoDB's flexibility supports adaptive schemas. The `schemaVersion` field within `memory_mementos` allows different memento structures to coexist and be interpreted correctly. NNNA is responsible for managing transitions and ensuring data integrity during schema changes. For significant structural changes in Weaviate that affect filtering or indexing (beyond just vector changes), NNNA would coordinate Weaviate schema updates and potential data backfilling/re-indexing.

### 5.3. Adaptive Schema Management ("Schema Synapse")
*   The "Schema Synapse" concept is realized through the NNNA process.
*   NNNA analyzes memory utility and patterns, identifying needs for new fields, changed granularity, or different data types within `MemoryMemento`.
*   **Process**:
    1.  NNNA identifies a required schema change.
    2.  It updates a central schema definition (e.g., a versioned JSON schema stored in MongoDB or a configuration service).
    3.  It notifies the `Ingestion Infinity-Loop` (e.g., via an internal API call or a message on a control queue).
    4.  The `Ingestion Infinity-Loop` loads the new schema version and adapts its memento construction logic.
    5.  NNNA may then trigger a background task to migrate or update existing mementos in MongoDB and Weaviate to conform to the new schema version if necessary (e.g., adding default values for new fields, re-processing data for Weaviate's filterable properties).
    6.  Both MongoDB (via `schemaVersion` field in documents) and Weaviate (via its schema update API) will reflect these changes.

## 6. Docker Orchestration

Services are containerized using Docker and orchestrated with [`docker-compose.yml`](../docker-compose.yml) for development, testing, and potentially simpler production deployments.

### 6.1. [`docker-compose.yml`](../docker-compose.yml) Structure (Conceptual Outline)

```yaml
version: '3.8'

services:
  # --- Core Application Services ---
  ingestion_service:
    build: ./ingestion_service # Path to Dockerfile for Ingestion Infinity-Loop
    ports:
      - "8001:8001" # Example port
    environment:
      - MONGODB_URI=${MONGODB_URI}
      - WEAVIATE_URL=${WEAVIATE_URL}
      - EMBEDDING_SERVICE_URL=http://embedding_service:8002
      - OPENAI_API_KEY=${OPENAI_API_KEY} # If used directly by ingestion for some reason
      # ... other env vars
    depends_on:
      - mongodb
      - weaviate
      - embedding_service
    volumes:
      - ./ingestion_service/src:/app/src # For development hot-reloading
    networks:
      - memorable_network

  embedding_service:
    build: ./embedding_service # Path to Dockerfile for Embedding Essence
    ports:
      - "8002:8002"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OLLAMA_BASE_URL=${OLLAMA_BASE_URL} # If using local Ollama
      # ...
    depends_on:
      - ollama # Optional, if using local models
    networks:
      - memorable_network

  retrieval_service: # Conscious Current
    build: ./retrieval_service
    ports:
      - "8003:8003"
    environment:
      - MONGODB_URI=${MONGODB_URI}
      - WEAVIATE_URL=${WEAVIATE_URL}
      - EMBEDDING_SERVICE_URL=http://embedding_service:8002
      # ...
    depends_on:
      - mongodb
      - weaviate
      - embedding_service
    networks:
      - memorable_network

  nnna_service: # Nocturnal Nurturing & Network Attunement
    build: ./nnna_service
    # No public ports needed, runs scheduled tasks
    environment:
      - MONGODB_URI=${MONGODB_URI}
      - WEAVIATE_URL=${WEAVIATE_URL}
      - EMBEDDING_SERVICE_URL=http://embedding_service:8002
      - INGESTION_SERVICE_URL=http://ingestion_service:8001 # For schema feedback
      # ...
    depends_on:
      - mongodb
      - weaviate
      - embedding_service
      - ingestion_service
    networks:
      - memorable_network

  personality_service: # Subconscious Synthesis
    build: ./personality_service
    ports:
      - "8004:8004"
    environment:
      - MONGODB_URI=${MONGODB_URI}
      # ...
    depends_on:
      - mongodb
    networks:
      - memorable_network

  # --- Data Stores ---
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    environment:
      - MONGO_INITDB_ROOT_USERNAME=${MONGO_ROOT_USER}
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_ROOT_PASS}
    networks:
      - memorable_network

  weaviate:
    image: semitechnologies/weaviate:latest # Or specific version
    ports:
      - "8080:8080" # Weaviate REST API
      - "50051:50051" # Weaviate gRPC API
    volumes:
      - weaviate_data:/var/lib/weaviate
    environment:
      QUERY_DEFAULTS_LIMIT: 25
      AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: 'true' # For dev; configure auth for prod
      PERSISTENCE_DATA_PATH: '/var/lib/weaviate'
      DEFAULT_VECTORIZER_MODULE: 'none' # Embeddings provided externally
      ENABLE_MODULES: 'text2vec-openai,generative-openai' # If using Weaviate's OpenAI integration for other purposes or future embedding
      OPENAI_APIKEY: ${OPENAI_API_KEY} # If Weaviate modules need it
      CLUSTER_HOSTNAME: 'node1'
    networks:
      - memorable_network

  # --- Optional Local Model Serving ---
  ollama: # For local Sentence Transformers etc.
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy: # GPU access example
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1 # or 'all'
              capabilities: [gpu]
    networks:
      - memorable_network

  # --- Other services like Agent Interface, Git Commit Collector would be added similarly ---

volumes:
  mongo_data:
  weaviate_data:
  ollama_data:

networks:
  memorable_network:
    driver: bridge
```

### 6.2. Environment Variable Management
*   Sensitive information (API keys, database credentials) is managed via environment variables.
*   A [`.env.example`](../.env.example) file provides a template for required variables.
*   In Docker Compose, these are typically sourced from a `.env` file in the project root.
*   For production, these would be injected securely by the deployment platform (e.g., Kubernetes Secrets, platform-specific environment variable management).
*   **No hardcoded secrets in code or Docker images.**

## 7. Scalability and Performance

### 7.1. Potential Bottlenecks
*   **Ingestion Service**: High volume of incoming data can overload preprocessing, embedding calls, and database writes.
*   **Embedding Service**: If using external APIs (like OpenAI), rate limits and network latency can be bottlenecks. If using local models, CPU/GPU resources for `Embedding Essence` or `Ollama` can be a constraint.
*   **Weaviate/MongoDB**: High query load or large data volumes can impact performance. Write contention during high ingestion rates.
*   **NNNA Service**: Resource-intensive during its processing window, potentially impacting other services if not managed well (though designed for off-peak).

### 7.2. Scaling Strategies
*   **Ingestion Service**:
    *   Horizontally scale `Ingestion Infinity-Loop` instances behind a load balancer.
    *   Use a message queue (e.g., RabbitMQ, Kafka) to decouple input reception from processing, allowing workers to consume tasks at their own pace.
*   **Embedding Service**:
    *   Horizontally scale `Embedding Essence` instances.
    *   If using local models (Ollama), scale Ollama instances and distribute requests.
    *   Implement caching for identical narrative embeddings if applicable (though narratives are often unique).
*   **Weaviate**:
    *   Scale Weaviate horizontally (requires a Weaviate cluster setup, more complex than single node).
    *   Optimize schema and indexing.
*   **MongoDB**:
    *   Utilize replica sets for read scaling and high availability.
    *   Sharding for write scaling and distributing large datasets (complex to implement).
    *   Optimize queries and indexes.
*   **NNNA Service**:
    *   Optimize queries and processing logic.
    *   Distribute tasks within NNNA if possible (e.g., process different agents' data in parallel).
    *   Ensure it runs during low-traffic periods.
*   **Stateless Services**: Most services (Ingestion, Embedding, Retrieval, Personality) can be designed to be stateless, making horizontal scaling straightforward.

### 7.3. Performance Implications of "Vectorize Everything"
*   **Initial Cost**: Embedding generation for all data incurs computational/API costs and latency during ingestion.
*   **Storage Cost**: Vector embeddings can be large, increasing storage requirements in Weaviate.
*   **NNNA's Role**: The "Nocturnal Nurturing & Network Attunement" process is crucial here. By comprehensively vectorizing upfront, NNNA has the full dataset to:
    *   Identify truly valuable information.
    *   Refine or re-generate embeddings for optimal recall.
    *   Inform archival or pruning strategies for less critical raw data or outdated embeddings, managing long-term storage and performance.
    *   This approach front-loads capture, allowing intelligent, offline refinement rather than premature filtering.

## 8. Modularity and Extensibility

*   **Microservice Architecture**: Each service has a single responsibility, allowing independent development, deployment, and scaling.
*   **Standardized APIs**: Clear REST (or gRPC/message queue) interfaces between services allow for easier replacement or addition of components.
*   **Adding New Context Types**:
    1.  Update the `MemoryMemento` schema definition (managed by NNNA and versioned).
    2.  Modify the `Ingestion Infinity-Loop` to parse and include the new context.
    3.  Update the `NarrativeWeaver` logic within `Embedding Essence` (or called by it) to incorporate the new context into the text for embedding.
    4.  Update `Conscious Current` to include this new context when formulating query narratives.
*   **Adding New Embedding Models**:
    1.  Create a new adapter/client within `Embedding Essence` for the new model.
    2.  Update configuration to allow selection of the new model (potentially dynamically or per-agent/per-contentType).
    3.  NNNA might trigger re-embedding of old mementos with the new model if desired.
*   **Adding New Input Sources**:
    1.  Develop a new adapter service or module for the specific source.
    2.  This adapter transforms source data into the format expected by `Ingestion Infinity-Loop` and calls its `/ingest` API.

## 9. "Living Git Log" Integration ("Codebase Chronicle")

The "Codebase Chronicle" component integrates Git commit data into MemoRable.

*   **Component**: A dedicated `CodeChangeCollector` service.
*   **Mechanism**:
    1.  **Git Hook Integration**: A `post-commit` hook in the monitored Git repository triggers the `CodeChangeCollector`.
    2.  **Polling (Alternative)**: The `CodeChangeCollector` could periodically poll the Git repository for new commits if hooks are not feasible.
*   **Data Flow**:
    1.  `CodeChangeCollector` receives/detects a new commit.
    2.  It parses commit data: author, message, timestamp, changed files, and the diff.
    3.  It transforms this into a `MemoryMemento` with `contentType: "CodeChange"`.
        *   `contentRaw`: Could be the full diff or structured data about changes.
        *   `contentProcessed`: Could be a summary of the commit message and key changes.
        *   `sourceSystem`: "CodebaseChronicle"
        *   `sourceIdentifier`: Commit hash.
        *   `temporalContext.eventTimestamp`: Commit timestamp.
        *   `reasoningContext.inferencesMade`: Could include parsed elements from commit messages (e.g., "Fixes #123").
    4.  This memento is sent to the `Ingestion Infinity-Loop`'s `/ingest` endpoint like any other data source.
*   **Embedding**: The "Contextual Narrative Weaving" for code changes will emphasize commit messages, changed file paths, and summaries of diffs to enable semantic search for code history (e.g., "Show me commits related to user authentication refactoring").

## 10. Security Considerations

Security is paramount, especially given the potentially sensitive nature of memories.

### 10.1. Data Encryption
*   **At Rest**:
    *   MongoDB: Enable encryption at rest features provided by MongoDB Atlas or self-hosted configurations (e.g., LUKS for disk encryption, MongoDB's native encryption).
    *   Weaviate: Data should be stored on encrypted volumes. Weaviate itself may offer encryption features depending on version and configuration.
    *   Backups must also be encrypted.
*   **In Transit**:
    *   All API communication between services and between clients/Agent Interface and the system must use TLS/HTTPS.
    *   Internal Docker network traffic can also be secured if deemed necessary, though often relies on network isolation.

### 10.2. Secure API Access
*   **Authentication**:
    *   External-facing APIs (e.g., for agent interaction or direct ingestion if applicable) must be protected. Options include API keys, OAuth2, or JWT-based authentication.
    *   Internal service-to-service communication can use simpler mechanisms like mutual TLS (mTLS) or network policies if running in an orchestrated environment like Kubernetes, or shared secrets/API keys managed securely.
*   **Authorization**:
    *   Ensure agents can only access their own memories (`agentId` filtering is critical in all database queries).
    *   Role-based access control (RBAC) if multiple users/admins interact with the system.

### 10.3. Management of Sensitive Data
*   **Emotional Context**: While valuable, emotional data is sensitive. Access should be strictly controlled.
*   **PII**: If mementos contain Personally Identifiable Information, appropriate data handling, masking, or anonymization techniques should be considered, especially for analytics or if data is shared.
*   **Principle of Least Privilege**: Each service should only have the permissions necessary to perform its functions.
*   **Secure Configuration Management**: API keys, database credentials, and other secrets must be managed securely (e.g., using environment variables injected at runtime, HashiCorp Vault, or cloud provider secret managers) and not hardcoded or stored in version control (referencing [`.env.example`](../.env.example)).
*   **Audit Logging**: Log significant events, especially data access, modifications, and administrative actions, for security monitoring and forensics.

### 10.4. Input Sanitization
*   The `Ingestion Infinity-Loop` must sanitize all incoming data to prevent injection attacks (e.g., NoSQL injection, XSS if content is ever rendered).

## 11. Future Considerations
*   **Advanced Graph-Based Recall**: While Weaviate handles semantic similarity, exploring dedicated graph databases for `reasoningContext.causalLinks` could enable more complex relational queries.
*   **Multi-Modal Mementos**: Extending beyond text to natively support image, audio, and video mementos with specialized embedding and processing pipelines.
*   **Federated Learning/Memory**: Architectures for agents to securely share or learn from generalized patterns without exposing raw memories.

This architecture provides a robust and extensible foundation for MemoRable - Total Recall, enabling sophisticated memory capabilities for AI agents.