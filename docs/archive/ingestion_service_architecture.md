# Ingestion Service Architecture

This document outlines the architecture for the memoRable Ingestion Microservice. It details the service boundaries, internal components, interfaces, communication protocols, data flows, and deployment considerations.

## 1. Overview

The Ingestion Service is responsible for receiving, processing, transforming, and storing memories from various input sources. It ensures data is correctly formatted, enriched, and made available for retrieval and analysis by other services within the memoRable ecosystem. The architecture emphasizes modularity, extensibility, and scalability to handle diverse data types and evolving requirements.

## 2. Architectural Goals

*   **Modularity:** Clearly defined components with distinct responsibilities.
*   **Extensibility:** Ability to easily add support for new input modalities, preprocessing steps, and storage backends.
*   **Scalability:** Design for horizontal scaling to handle varying ingestion loads.
*   **Resilience:** Robust error handling and fault tolerance mechanisms.
*   **Maintainability:** Clear interfaces and well-documented components.
*   **Dynamic Schema Management:** Support for an auto-tuning schema mechanism.

## 3. Service Boundaries and Components

The Ingestion Service operates as a standalone microservice. Internally, it is composed of several key components:

```mermaid
graph TD
    subgraph Ingestion Microservice
        A[API Gateway/Input Receiver] --> B(IngestionIntegrator)
        B --> C{PreprocessingPrism}
        C --> D(MementoConstructor)
        D --> E(SchemaManager)
        E --> F(MemorySteward)
        F --> G[Data Storage Interface]
        C --> H[Embedding Service Client]
        E --> I[NNNA Service Client]
    end

    Ext_API[External API Clients] --> A
    G --> Ext_DataStore[Data Storage (e.g., Vector DB, Document DB)]
    H --> Ext_EmbeddingService[Embedding Service]
    I --> Ext_NNNAService[NNNA Service]

    style Ingestion Microservice fill:#f9f,stroke:#333,stroke-width:2px
```

### 3.1. Internal Components:

*   **API Gateway/Input Receiver:**
    *   **Responsibility:** Acts as the primary entry point for all incoming data. Handles various input protocols (e.g., REST, gRPC, message queues) and authenticates requests. Routes data to the `IngestionIntegrator`.
    *   **Interfaces:** Exposes public-facing APIs (e.g., `/ingest/text`, `/ingest/image`, `/ingest/audio`).
*   **`IngestionIntegrator`:**
    *   **Responsibility:** Orchestrates the ingestion workflow. Receives raw data from the API Gateway, determines the data type, and routes it to the appropriate preprocessing modules within the `PreprocessingPrism`. Manages the overall flow and error handling for an ingestion request.
    *   **Interfaces:** Internal APIs to interact with `PreprocessingPrism` and `MementoConstructor`.
*   **`PreprocessingPrism`:**
    *   **Responsibility:** A collection of modules for processing different data modalities (text, image, audio, video, etc.). Performs tasks like data extraction, cleaning, normalization, and feature extraction (e.g., calling the Embedding Service).
    *   **Interfaces:** Internal APIs for each preprocessing module (e.g., `processText(data)`, `processImage(data)`). Communicates with the external Embedding Service.
*   **`MementoConstructor`:**
    *   **Responsibility:** Transforms preprocessed data into a standardized "Memento" object based on the current schema. This involves structuring the data, adding metadata, and ensuring compliance with the defined schema.
    *   **Interfaces:** Internal APIs to receive preprocessed data and interact with the `SchemaManager` to fetch the current schema.
*   **`SchemaManager`:**
    *   **Responsibility:** Manages the "auto-tuning schema." It defines the structure of Mementos, validates data against the schema, and evolves the schema over time based on new data patterns or explicit updates. It may interact with the NNNA service for schema inference or suggestions.
    *   **Interfaces:** Internal APIs for schema validation (`validate(data, schema)`), schema retrieval (`getCurrentSchema(dataType)`), and schema updates (`updateSchema(newSchema)`). Communicates with the NNNA Service for schema evolution tasks.
*   **`MemorySteward`:**
    *   **Responsibility:** Persists the constructed Memento objects to the appropriate data stores. Handles interactions with different storage backends (e.g., vector database for embeddings, document database for metadata). Manages data indexing and ensures data integrity.
    *   **Interfaces:** Internal APIs to store Mementos (`storeMemento(memento)`). Interacts with the Data Storage Interface.
*   **Data Storage Interface:**
    *   **Responsibility:** An abstraction layer over the actual data storage solutions. This allows for flexibility in choosing and changing storage technologies.
    *   **Interfaces:** Generic data access methods (e.g., `save(collection, data)`, `findById(collection, id)`).

### 3.2. External Service Interactions:

*   **Embedding Service:**
    *   **Protocol:** REST/gRPC.
    *   **Interaction:** `PreprocessingPrism` sends data (text, image chunks, etc.) to the Embedding Service to get vector embeddings.
*   **NNNA (Neural Network-Numeric Architecture) Service:**
    *   **Protocol:** REST/gRPC.
    *   **Interaction:** `SchemaManager` may send data samples or schema evolution requests to the NNNA Service to get suggestions for schema updates or to infer new schema structures.
*   **Data Storage (e.g., Weaviate, PostgreSQL):**
    *   **Protocol:** Native database clients/APIs.
    *   **Interaction:** `MemorySteward` (via Data Storage Interface) writes Mementos (metadata and embeddings) to the configured data stores.

## 4. Interfaces and Communication Protocols

### 4.1. Internal Communication:

*   Primarily through direct method calls within the same process or via an internal event bus/message queue if components are deployed as separate sub-modules (though initially, they are expected to be part of the same service process).
*   Data formats: Standardized internal data structures (e.g., Python Pydantic models, Java POJOs).

### 4.2. External Communication:

*   **Ingestion API (exposed by API Gateway):**
    *   **Protocol:** REST (initially), potentially gRPC for performance-critical paths.
    *   **Endpoints:**
        *   `POST /api/v1/ingest/text`: Ingests textual data.
            *   Request Body: `{ "content": "...", "metadata": { ... } }`
            *   Response: `{ "mementoId": "...", "status": "processing/success/failure" }`
        *   `POST /api/v1/ingest/image`: Ingests image data (e.g., multipart/form-data).
            *   Request Body: Image file, optional `{ "metadata": { ... } }`
            *   Response: `{ "mementoId": "...", "status": "processing/success/failure" }`
        *   `POST /api/v1/ingest/audio`: Ingests audio data.
        *   `POST /api/v1/ingest/url`: Ingests content from a URL.
    *   **Authentication:** API Keys, OAuth2 tokens.
*   **Communication with Embedding Service:**
    *   **Protocol:** REST or gRPC.
    *   **Endpoint (example for REST):** `POST /embed`
    *   **Request:** `{ "data_type": "text/image", "content": "..." or binary_data }`
    *   **Response:** `{ "embedding": [...] }`
*   **Communication with NNNA Service:**
    *   **Protocol:** REST or gRPC.
    *   **Endpoint (example for REST):** `POST /schema/suggest`
    *   **Request:** `{ "data_sample": { ... }, "current_schema": { ... } }`
    *   **Response:** `{ "suggested_schema_update": { ... } }`
*   **Communication with Data Storage:**
    *   Via database-specific client libraries (e.g., Weaviate Python client, psycopg2 for PostgreSQL).

## 5. Data Flow and Key Ingestion Scenarios

### 5.1. Standard Text Ingestion Flow:

```mermaid
sequenceDiagram
    participant Client
    participant API Gateway
    participant IngestionIntegrator
    participant PreprocessingPrism
    participant EmbeddingService
    participant MementoConstructor
    participant SchemaManager
    participant MemorySteward
    participant DataStorage

    Client->>API Gateway: POST /ingest/text (text, metadata)
    API Gateway->>IngestionIntegrator: Forward request
    IngestionIntegrator->>PreprocessingPrism: processText(text, metadata)
    PreprocessingPrism->>EmbeddingService: Get embedding for text
    EmbeddingService-->>PreprocessingPrism: Return embedding
    PreprocessingPrism-->>IngestionIntegrator: Return preprocessed_data (text, embedding, metadata)
    IngestionIntegrator->>MementoConstructor: constructMemento(preprocessed_data)
    MementoConstructor->>SchemaManager: getCurrentSchema("text_memento")
    SchemaManager-->>MementoConstructor: Return schema
    MementoConstructor->>SchemaManager: validate(data, schema)
    SchemaManager-->>MementoConstructor: Validation result
    MementoConstructor-->>IngestionIntegrator: Return Memento object
    IngestionIntegrator->>MemorySteward: storeMemento(Memento)
    MemorySteward->>DataStorage: Save Memento (metadata + embedding)
    DataStorage-->>MemorySteward: Confirmation
    MemorySteward-->>IngestionIntegrator: Success
    IngestionIntegrator-->>API Gateway: Success (mementoId)
    API Gateway-->>Client: Success (mementoId)
```

### 5.2. Multi-modal Input Processing:

The `PreprocessingPrism` is key to handling multi-modal inputs. It will contain specific modules for each modality:
*   **Text:** Cleaning, tokenization, embedding.
*   **Image:** Resizing, feature extraction (e.g., CLIP embeddings via Embedding Service), OCR if applicable.
*   **Audio:** Transcription (potentially via an external service or a dedicated module), embedding of audio or transcribed text.
*   **Video:** Frame extraction, processing frames as images, processing audio track.

The `IngestionIntegrator` identifies the input type and directs it to the appropriate `PreprocessingPrism` module(s). The `MementoConstructor` then assembles a unified Memento, potentially with distinct fields for different modalities or a common structure that accommodates them.

## 6. Auto-tuning Schema Mechanism

The `SchemaManager` is central to the auto-tuning schema.

1.  **Initial Schema:** A baseline schema is defined for common Memento types (e.g., text, image).
2.  **Schema Validation:** All incoming data, after being processed by `MementoConstructor`, is validated against the current schema by `SchemaManager`.
3.  **Schema Evolution Triggers:**
    *   **New Data Patterns:** If `MementoConstructor` encounters data that doesn't fit the current schema (e.g., new metadata fields consistently appear), it can flag this to `SchemaManager`.
    *   **Explicit User/Admin Input:** A mechanism for administrators to propose schema changes.
    *   **Periodic Review (NNNA Interaction):** `SchemaManager` can periodically send samples of ingested data or observed patterns to the NNNA Service.
4.  **NNNA Service Interaction:**
    *   The NNNA Service can analyze data samples and suggest schema modifications (e.g., adding new fields, changing data types, suggesting new relationships).
    *   It might identify common unstructured metadata that could be formalized into new schema fields.
5.  **Schema Update Process:**
    *   Proposed changes (from NNNA or other triggers) are reviewed (potentially with a human-in-the-loop initially).
    *   `SchemaManager` updates the active schema. Versioning of schemas is crucial to handle data ingested under older schemas.
    *   A strategy for migrating or re-indexing existing data to conform to new schema versions might be necessary, or queries will need to be schema-aware.
6.  **Feedback Loop:** The effectiveness of schema changes is monitored (e.g., improved retrieval, better data organization).

```mermaid
graph TD
    subgraph Schema Management
        SM[SchemaManager]
        MC[MementoConstructor] -->|Data for Validation| SM
        SM -->|Current Schema| MC
        SM -->|Validation Result| MC

        SM -->|Data Samples/Patterns| NNNASvc[NNNA Service Client]
        NNNASvc -->|Schema Suggestions| SM

        Admin[Admin Interface/Tool] -->|Schema Update Requests| SM

        SM -->|Updated Schema| DS_Schema[Schema Definition Store]
        SM -->|Schema Versioning Logic| SM
    end
```

## 7. Deployment Considerations

The Ingestion Service will be deployed as a Docker container, managed by `docker-compose.yml` alongside other memoRable microservices.

*   **Dockerfile:**
    *   A new Dockerfile will be created for the Ingestion Service, likely in `src/services/ingestion_service/Dockerfile`.
    *   It will be based on an appropriate base image (e.g., Python, Node.js, Java depending on implementation language).
    *   It will copy the service code, install dependencies, and define the entry point.
    *   Example structure (for Python/FastAPI):
        ```dockerfile
        # src/services/ingestion_service/Dockerfile
        FROM python:3.10-slim

        WORKDIR /app

        COPY ./src/services/ingestion_service/requirements.txt /app/requirements.txt
        RUN pip install --no-cache-dir -r requirements.txt

        COPY ./src/services/ingestion_service /app/src/services/ingestion_service
        COPY ./src/common /app/src/common # If common utilities are used

        # Expose the port the service runs on
        EXPOSE 8001 

        CMD ["uvicorn", "src.services.ingestion_service.main:app", "--host", "0.0.0.0", "--port", "8001"]
        ```
*   **`docker-compose.yml` Updates:**
    *   A new service entry for `ingestion_service` will be added.
    *   It will define the build context (pointing to its Dockerfile), ports, environment variables (e.g., database connection strings, Embedding Service URL, NNNA Service URL), and dependencies on other services (e.g., data stores).
    *   Example snippet for [`docker-compose.yml`](docker-compose.yml):
        ```yaml
        services:
          # ... other services
          ingestion_service:
            build:
              context: .
              dockerfile: src/services/ingestion_service/Dockerfile
            ports:
              - "8001:8001" # Expose port 8001 for the ingestion service
            environment:
              - DATABASE_URL=postgresql://user:password@postgres_db:5432/memorable_db
              - VECTOR_DB_URL=http://weaviate:8080
              - EMBEDDING_SERVICE_URL=http://embedding_service:8002 # Assuming embedding service runs on 8002
              - NNNA_SERVICE_URL=http://nnna_service:8003 # Assuming NNNA service runs on 8003
              - LOG_LEVEL=INFO
            depends_on:
              - postgres_db # Example dependency
              - weaviate    # Example dependency
              - embedding_service
              - nnna_service
            volumes:
              - ./src/services/ingestion_service:/app/src/services/ingestion_service # For development hot-reloading
              - ./src/common:/app/src/common # If common utilities are used
            networks:
              - memorable_network
        
        # ... networks definition
        ```
*   **Configuration Management:**
    *   Service-specific configurations (ports, external service URLs, credentials) will be managed via environment variables, populated by `docker-compose.yml` or Kubernetes ConfigMaps/Secrets in a production environment.
*   **Scalability:**
    *   The service should be stateless where possible to allow for easy horizontal scaling (running multiple instances behind a load balancer).
    *   If an internal message queue is used for decoupling components like `PreprocessingPrism` or `MemorySteward`, these can also be scaled independently.
*   **Logging and Monitoring:**
    *   Structured logging will be implemented.
    *   Metrics (e.g., ingestion rate, error rates, processing times) will be exposed for monitoring (e.g., via Prometheus).

## 8. Extensibility Points

*   **New Input Modalities:** Add new modules to `PreprocessingPrism` and update `IngestionIntegrator` to route to them. Define new API endpoints in the API Gateway.
*   **New Preprocessing Steps:** Add new functions/classes within existing `PreprocessingPrism` modules or create new ones.
*   **New Metadata Fields:** Leverage the auto-tuning schema or allow explicit schema updates via `SchemaManager`.
*   **New Storage Backends:** Implement new adapters for the Data Storage Interface.

## 9. Security Considerations

*   **Input Validation:** Rigorous validation of all incoming data at the API Gateway and by `SchemaManager`.
*   **Authentication & Authorization:** Secure API endpoints. Internal service-to-service communication might use mTLS or token-based auth.
*   **Data Sanitization:** Sanitize inputs to prevent injection attacks, especially if any part of the input is used in queries or stored directly.
*   **Secrets Management:** No hardcoded secrets; use environment variables or a secrets management system.

## 10. Open Questions & Future Considerations

*   Detailed strategy for schema versioning and data migration.
*   Specific implementation choice for internal communication (direct calls vs. event bus).
*   Error handling and retry mechanisms for external service calls.
*   Rate limiting and throttling at the API Gateway.
*   Batch ingestion capabilities.