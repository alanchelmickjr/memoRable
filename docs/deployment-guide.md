# MemoRable Deployment Guide

## Prerequisites

- Node.js >= 18.0.0
- Docker and Docker Compose
- NVIDIA GPU (optional, for enhanced performance)
- pnpm (for package management)

## Quick Start

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/memorable.git
   cd memorable
   ```

2. **Run Setup Script**
   ```bash
   pnpm run setup
   ```
   This will:
   - Check system requirements
   - Configure environment variables
   - Create necessary directories
   - Pull Docker images
   - Set up Hume.ai integration (optional)

3. **Start the Services**
   ```bash
   pnpm run docker:up
   ```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Node Environment
NODE_ENV=development
PORT=3000

# MongoDB
MONGO_USER=your_username
MONGO_PASSWORD=your_secure_password

# Redis
REDIS_PASSWORD=your_secure_password

# Hume.ai (Optional)
HUME_API_KEY=your_api_key

# Memory Windows
MEMORY_WINDOW_SHORT=1200000  # 20 minutes
MEMORY_WINDOW_MEDIUM=3600000 # 1 hour
MEMORY_WINDOW_LONG=86400000  # 24 hours

# Emotion Processing
EMOTION_THRESHOLD=0.7
EMOTION_UPDATE_INTERVAL=5000
```

### Resource Limits

Default resource limits in `docker-compose.yml`:

- Development:
  - App: 4GB RAM, 8 CPUs
  - MongoDB: 4GB RAM, 2 CPUs
  - Redis: 2GB RAM, 1 CPU
  - Weaviate: 4GB RAM, 2 CPUs
  - Ollama: 8GB RAM, 8 CPUs

- Production:
  - App: 16GB RAM, 8 CPUs
  - MongoDB: 4GB RAM, 2 CPUs
  - Redis: 2GB RAM, 1 CPU
  - Weaviate: 4GB RAM, 2 CPUs
  - Ollama: 24GB RAM, 8 CPUs

Adjust these in `docker-compose.yml` based on your hardware capabilities.

## Monitoring

Access monitoring tools:

- Grafana: http://localhost:3001
  - Default credentials: admin/admin
  - Pre-configured dashboards available

- Prometheus: http://localhost:9090
  - Metrics and alerts
  - Query interface

## Health Checks

Monitor system health:

```bash
# Check overall health
curl http://localhost:3000/health

# View service logs
pnpm run docker:logs

# Check specific service
pnpm run docker:logs app
```

## Common Operations

### Starting/Stopping Services

```bash
# Start services
pnpm run docker:up

# Stop services
pnpm run docker:down

# Restart services
pnpm run docker:restart

# View logs
pnpm run docker:logs
```

### Maintenance

```bash
# Clean up volumes
pnpm run docker:clean

# Rebuild containers
pnpm run docker:rebuild
```

### Updating

```bash
# Pull latest changes
git pull

# Update dependencies
pnpm install

# Rebuild containers
pnpm run docker:rebuild

# Restart services
pnpm run docker:restart
```

## Troubleshooting

### Common Issues

1. **Memory Issues**
   - Increase Docker memory limits
   - Check container resource usage
   - Monitor Redis memory usage

2. **Connection Issues**
   - Verify service health status
   - Check network connectivity
   - Validate environment variables

3. **Performance Issues**
   - Monitor CPU/Memory usage
   - Check model loading times
   - Verify cache hit rates

### Getting Help

- Check logs: `pnpm run docker:logs`
- Review health metrics in Grafana
- Check GitHub issues
- Review technical documentation

## Security Notes

- Change default passwords
- Secure environment variables
- Configure firewall rules
- Regular security updates
- Monitor access logs

## Production Deployment

Additional considerations for production:

1. **Security**
   - Use strong passwords
   - Enable SSL/TLS
   - Configure firewalls
   - Regular security updates

2. **Backup**
   - Configure MongoDB backups
   - Set up Redis persistence
   - Back up environment configs
   - Document restore procedures

3. **Monitoring**
   - Set up alerts
   - Configure log retention
   - Monitor resource usage
   - Track system metrics

4. **Scaling**
   - Configure load balancing
   - Set up container orchestration
   - Monitor performance metrics
   - Plan resource allocation