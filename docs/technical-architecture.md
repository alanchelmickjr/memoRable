# MemoRable - Total Recall: Technical Architecture

## System Overview

MemoRable - Total Recall is an advanced AI memory system designed to provide agents with human-like, comprehensive memory capabilities. It functions as a sophisticated **"context conductor,"** meticulously managing and interleaving temporal, spatial, emotional, and reasoning contexts to empower AI agents with focused task execution and a coherent sense of identity derived from memory.

The architecture is built on **first-principles thinking** to address the novel challenges of creating true "total recall" for AI. A key innovation is the **Dual-Model Memory Architecture**:
*   **Subconscious Scanner Model (Gemini)**: A powerful model (e.g., Gemini) with a large context window continuously scans and processes the entirety of an agent's long-term memory. It identifies patterns, relationships, and potential relevancies, acting as a background "subconscious" process.
*   **Conscious Access Model**: This model, likely smaller and more agile, directly interfaces with the agent's active tasks. When specific memories or insights are needed, it queries the pre-processed information and relevant data surfaced by the Subconscious Scanner.
*   **Adaptable Context Windows**: The system employs adaptable context windows for different models and tasks. This allows for efficient processing, where routine information might be handled with less "attentional" load, and frequently repeated actions can become near-autonomic.

**Deployment Strategy**:
MemoRable is designed as an **npm installable package**, providing core memory services that can be integrated into various AI agent projects. While **Docker and Docker Compose are utilized extensively for development and testing environments** (orchestrating services like MongoDB for persistent storage and Weaviate for vector search), the core system is architected for flexible deployment. Initial production targets include stateless environments like Vercel, with adaptability for stateful deployments as well. This approach ensures broad applicability and ease of integration.

## Core Components

### 1. Service Layer

#### ModelSelectionService
- Handles dynamic model selection and switching
- Implements memoization for response caching
- Manages model state and performance metrics
- Provides warm-up functionality for models

## 💡 Core Architectural Principles

The technical architecture of MemoRable - Total Recall is founded on several key principles:

*   **Context as a First-Class Citizen**: The system is designed to act as a "context conductor." All memory items are rich with interwoven temporal, spatial, emotional, and reasoning contexts, enabling nuanced understanding and retrieval.
*   **Memory-Derived Identity**: The architecture supports the core concept that an agent's personality and coherence emerge from its accumulated and accessible memories.
*   **Dual-Model Memory Processing (Conscious/Subconscious Paradigm)**:
    *   **Subconscious Scanner (Gemini Focus)**: A dedicated, powerful model (initially targeting Gemini due to its large context window capabilities) is responsible for the continuous, comprehensive scanning and indexing of the long-term memory corpus. This "subconscious" layer proactively identifies patterns, relationships, and potential relevancies.
    *   **Conscious Access Model**: This model serves the agent's immediate operational needs. It queries the insights and distilled information provided by the Subconscious Scanner, enabling rapid access to relevant memories without needing to process the entire memory store itself for every query.
    *   **Adaptable Context Windows & Autonomic Processing**: The interaction between these models leverages adaptable context windows. The Subconscious Scanner utilizes a broad window for its deep dives, while the Conscious Access Model can operate with more focused, dynamically adjusted windows. This design aims to mimic cognitive efficiency, where less critical or routine information is processed with lower "attentional" load, and highly repeated actions can become almost autonomic, freeing the Conscious Access Model for higher-order tasks.
*   **Layered Data Persistence**:
    *   **MongoDB**: Serves as the robust, persistent store for raw, detailed memory data.
    *   **Weaviate**: Provides high-performance vector search capabilities for semantic memory retrieval.
    *   **Redis**: Acts as a high-speed cache for frequently accessed data and session information.
*   **Dockerized Development & Flexible Deployment**: The entire system is developed and tested within a Dockerized environment, ensuring consistency. However, the core memory services are designed as an npm-installable package, allowing for flexible deployment in various environments, including stateless (e.g., Vercel) and stateful server architectures.
*   **Modularity and Extensibility**: Services are designed to be modular, allowing for independent development, scaling, and a clear separation of concerns.
*   **First-Principles Innovation**: Given the novel aspiration of "total recall," the architecture prioritizes innovative solutions derived from first principles rather than solely relying on existing paradigms.
*   **Alliterative Naming**: Where appropriate, components and concepts (e.g., "Memory Mesh," "Contextual Core," "Subconscious Scanner," "Conscious Conductor") will use alliterative naming to enhance clarity and memorability.

---
#### NightProcessingService
- Runs during off-peak hours (1 AM - 4 AM)
- Analyzes interaction patterns
- Optimizes model performance
- Manages cache warming strategies
- Predicts memory usage patterns

#### IdentityService
- Manages passphrase-based authentication
- Handles user preferences
- Controls memory access permissions
- Ensures secure identity management

#### ResponseRefinementService
- Processes real-time interactions
- Applies user preferences to responses
- Manages response updates/retractions
- Integrates with confidence scoring

#### ConfidenceService
- Implements quick confidence scoring
- Tracks 21-day interaction patterns
- Monitors mental health indicators
- Manages attention decay system
- Categorizes interaction patterns

#### TaskHopperService
- Manages task and instruction queues
- Tracks step-by-step progress
- Handles AI task integration
- Maintains task relationships

### 2. Infrastructure

The infrastructure is designed for robustness, scalability, and maintainability, primarily leveraging a Dockerized environment for development and offering flexibility for production deployment.

#### Dockerized Development Environment
- **Orchestration**: Docker Compose is used to define and manage the multi-container application services (MemoRable core, MongoDB, Weaviate, Redis, Ollama, monitoring tools).
- **Consistency**: Ensures a consistent environment across development, testing, and CI/CD pipelines.
- **Resource Optimization**: Container configurations are optimized for resource usage, with considerations for GPU access for AI model acceleration where applicable.
- **Isolation & Communication**: Services are isolated within containers, communicating over defined Docker networks.
- **Health & Scaling**: The Docker setup includes health monitoring and is designed with future scaling capabilities in mind, although production scaling might involve more advanced orchestration like Kubernetes.

#### Data Persistence Layer (Managed within Docker for Development)
- **MongoDB**: Serves as the primary persistent datastore for raw, detailed memory items, including their rich contextual metadata (temporal, spatial, emotional, reasoning). Its schema flexibility is advantageous for evolving memory structures.
- **Weaviate**: Functions as the dedicated vector database. It stores and indexes vector embeddings of memory items, enabling rapid semantic search and similarity comparisons crucial for the Subconscious Scanner model and relevant memory retrieval.
- **Redis**: Employed as a high-speed in-memory cache (LRU policy) for frequently accessed data, such as active session information, hot memory items, and potentially pre-computed patterns to accelerate responses from the Conscious Access Model.
- **Data Integrity**: Includes strategies for data persistence, backup, and recovery, particularly for MongoDB and Weaviate.

#### Monitoring Stack
- Prometheus for metrics collection
- Grafana for visualization
- Service-level monitoring
- Performance tracking
- Health check dashboard
- Automated alerts

### 3. Testing Infrastructure

#### CI/CD Pipeline
- GitHub Actions workflow
- Automated testing
- Integration verification
- Load testing with k6
- Smoke testing
- Automated rollbacks

## Data Flow & Memory Processing

The flow of data and the processing of memories are central to MemoRable's architecture, involving several key stages and the interplay between the dual memory models:

1.  **Input & Contextualization**:
    *   User input (text, voice, image, etc.) is received by the system.
    *   The `IdentityService` authenticates the user and retrieves any relevant user-specific configurations or preferences.
    *   Input is processed to extract explicit data and implicit contextual cues. This includes emotional tone (e.g., via `HumeService`), environmental factors, and the ongoing task context (managed by `TaskHopperService`).
    *   A rich contextual snapshot is created for the current interaction moment.

2.  **Memory Interaction & Response Generation (Conscious Access Model Focus)**:
    *   The **Conscious Access Model** (its selection potentially guided by `ModelSelectionService` based on current context and task) determines if memory retrieval is necessary to formulate an optimal response.
    *   If memory is required, the Conscious Access Model formulates a query. This query might be a natural language question, keywords, or more likely, a vector embedding representing the current contextual snapshot.
    *   The query is dispatched to the memory system:
        *   **High-Speed Cache Check (Redis)**: The system first checks Redis for highly relevant, recently accessed, or pre-computed/summarized memory items that match the query.
        *   **Vector Search (Weaviate)**: If a suitable match isn't found in the cache, or if a broader search is indicated, the query vector is used to search Weaviate. Weaviate returns a set of semantically similar memory embeddings, ranked by relevance.
        *   **Full Data Retrieval (MongoDB)**: The identifiers from the Weaviate search results are used to retrieve the complete, detailed memory items from MongoDB.
    *   The retrieved memories, along with the current interaction context, are provided to the Conscious Access Model.
    *   The model generates a candidate response.
    *   This response may be further processed by the `ResponseRefinementService`, applying user preferences and integrating confidence scores from the `ConfidenceService`.

3.  **Memory Storage & Indexing (Continuous & Post-Interaction)**:
    *   The new interaction (including the initial input, the full contextual snapshot, the agent's response, and any associated emotional or analytical metadata) is packaged as a new memory item.
    *   This comprehensive memory item is persistently stored in **MongoDB**.
    *   An embedding vector is generated for this new memory item (or key aspects of it).
    *   This embedding is stored in **Weaviate**, linked to the corresponding raw data record in MongoDB, making it discoverable for future semantic searches.
    *   Salient or frequently accessed aspects of this new memory might be proactively cached in **Redis**.

4.  **Continuous Background Memory Processing (Subconscious Scanner Model - Gemini Focus)**:
    *   The **Subconscious Scanner Model (e.g., Gemini)** operates asynchronously and continuously in the background.
    *   It processes the entire memory corpus stored across MongoDB (for rich details) and Weaviate (for vector relationships).
    *   **Pattern Recognition & Abstraction**: It identifies recurring patterns, emotional trends, conceptual links, and contextual relationships across vast amounts of stored memory data.
    *   **Memory Consolidation & Linking**: It strengthens connections between related memories, potentially creating abstracted summaries or higher-level insights. This is akin to human memory consolidation.
    *   **Proactive Indexing & Cache Priming**: Insights generated by the Subconscious Scanner can inform updates to Weaviate's indexing strategies or proactively prime the Redis cache with memories anticipated to be relevant for future interactions.
    *   This ongoing "subconscious" processing ensures that the memory store is not just a passive repository but an actively organized and understood knowledge base.

5.  **Scheduled Nightly Processing (`NightProcessingService`)**:
    *   This service complements the continuous work of the Subconscious Scanner by performing more resource-intensive tasks during off-peak hours.
    *   This includes deep pattern analysis across the entire dataset, comprehensive model performance evaluations based on historical interactions, extensive cache warming strategies, and predictive analysis for memory usage and system optimization.

This multi-layered data flow and processing strategy aims to provide both rapid, contextually relevant memory access for immediate interactions and deep, evolving understanding of the agent's entire history of experiences.

## Security Measures

1.  **Authentication**
    *   Passphrase-based system
    *   Session management
    *   Access control

2.  **Data Protection**
    *   Encrypted storage
    *   Secure communication
    *   Memory access controls

3.  **Infrastructure Security**
    *   Container isolation
    *   Network segmentation
    *   Resource limits
    *   Health monitoring

## Scaling Considerations

1.  **Horizontal Scaling**
    *   Container orchestration
    *   Load balancing
    *   Service replication

2.  **Resource Management**
    *   Dynamic resource allocation
    *   Memory optimization
    *   CPU utilization control
    *   GPU access management

3.  **Performance Optimization**
    *   Response caching
    *   Model warm-up
    *   Pattern memoization
    *   Load distribution

## Monitoring and Maintenance

1.  **Health Monitoring**
    *   Service health checks
    *   Performance metrics
    *   Resource utilization
    *   Error tracking

2.  **Alerting System**
    *   Performance thresholds
    *   Error conditions
    *   Resource constraints
    *   System health

3.  **Maintenance Procedures**
    *   Automated backups
    *   System updates
    *   Model updates
    *   Performance tuning