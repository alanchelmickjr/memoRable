# MemoRable 🧠

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![NPM Version](https://img.shields.io/npm/v/memorable.svg)](https://www.npmjs.com/package/memorable)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![Hume.ai](https://img.shields.io/badge/Powered%20by-Hume.ai-FF69B4)](https://hume.ai)
[![Demo](https://img.shields.io/badge/Live%20Demo-mindfulmoments.io-blue)](https://mindfulmoments.io)

An advanced AI memory system enabling personalized, context-aware interactions through sophisticated memory management and emotional intelligence. Experience it live at [mindfulmoments.io](https://mindfulmoments.io) - your companion for mindfulness and personal growth through AI-powered emotional mirroring.

## 🌟 Features

- **Multi-modal Input Processing**
  - Text, vision, audio, and video processing
  - AI response handling
  - File management
  - Extensible sensor framework

- **Contextual Indexing**
  - Environmental data tracking
  - Temporal awareness
  - Task context management
  - Conversation history
  - Geospatial integration

- **Advanced Emotional Intelligence**
  - 83 distinct emotional vectors including:
    - Core emotions (joy, sadness, anger, etc.)
    - Complex emotions (nostalgia, contemplation, aesthetic appreciation)
    - Social emotions (empathic pain, adoration, triumph)
    - Cognitive states (concentration, confusion, realization)
  - Multi-modal emotion detection
  - Cross-referenced emotional context
  - Real-time emotional state analysis
  - Color-coded emotional visualization

- **Three-tier Memory Architecture**
  - Raw data storage (MongoDB)
  - Vector embeddings (Weaviate)
  - Active memory buffer (Redis)

- **Custom Model Training**
  - Personalized emotional pattern recognition
  - User-specific interaction learning
  - Adaptive response calibration
  - Continuous model improvement
  - Fine-tuning capabilities for:
    - Emotional recognition accuracy
    - Personal interaction style
    - Context sensitivity
    - Response generation

## 🏗️ Architecture

```mermaid
graph TD
    A[Multi-modal Input] --> B[Input Processor]
    B --> C[Contextual Indexer]
    B --> D[Emotional Processor]
    C --> E[Memory Manager]
    D --> E
    E --> F[MongoDB]
    E --> G[Weaviate]
    E --> H[Redis]
    E --> I[Attention System]
    I --> J[Predictive Behavior]
```

## 🛠️ Tech Stack

- Node.js/NPM
- MongoDB (time series)
- Weaviate (vector database)
- Redis (active memory)
- Docker
- Ollama (AI models)
- TensorFlow.js
- Hume.ai (emotion analysis)
- Custom embedding solutions

## 📋 Prerequisites

- Node.js >= 18.0.0
- Docker and Docker Compose
- MongoDB
- Redis
- Weaviate
- Ollama
- Hume.ai API key

## 🚀 Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/memorable.git
cd memorable
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start the services**
```bash
npm run docker:up
```

5. **Run the application**
```bash
npm start
```

## 💻 Development

1. **Start in development mode**
```bash
npm run dev
```

2. **Run tests**
```bash
npm test
```

3. **Lint code**
```bash
npm run lint
```

## 🏛️ Project Structure

```
memorable/
├── src/
│   ├── config/           # Configuration files
│   ├── core/             # Core system components
│   ├── models/           # Data models
│   ├── services/         # Business logic
│   ├── utils/            # Utility functions
│   └── index.js          # Application entry point
├── tests/                # Test files
├── docker/               # Docker configuration
├── docs/                 # Documentation
└── scripts/             # Utility scripts
```

## 🔧 Configuration

The system can be configured through environment variables:

- `MONGODB_URI`: MongoDB connection string
- `REDIS_URL`: Redis connection URL
- `WEAVIATE_URL`: Weaviate instance URL
- `OLLAMA_API_KEY`: Ollama API key
- `HUME_API_KEY`: Hume.ai API key
- `PORT`: Application port (default: 3000)

## 📖 Documentation

Detailed documentation is available in the [docs](./docs) directory:

- [Architecture Overview](./docs/architecture.md)
- [API Reference](./docs/api.md)
- [Development Guide](./docs/development.md)
- [Deployment Guide](./docs/deployment.md)
- [Emotion Processing Guide](./docs/emotions.md)
- [Custom Model Training](./docs/custom-models.md)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🌟 Try it Live

Experience MemoRable in action at [mindfulmoments.io](https://mindfulmoments.io) - a mindfulness and mirroring application that helps you understand how AI and the world perceive you, supporting your personal development and success journey.

## 🙏 Acknowledgments

- [Hume.ai](https://hume.ai) team for their incredible emotion AI technology
- TensorFlow.js team for machine learning capabilities
- Weaviate team for vector database functionality
- MongoDB team for time series database support
- Redis team for in-memory data store
- Ollama team for AI model support