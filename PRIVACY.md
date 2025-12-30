# MemoRable Privacy Policy

**Last Updated:** December 2024

## Overview

MemoRable is a context-aware memory system for AI agents. This privacy policy explains how we collect, use, store, and protect your data when you use MemoRable as a self-hosted service or through the Anthropic MCP Connectors Directory.

## Data We Collect

### Memory Data
When you use MemoRable, we store the following information:

| Data Type | Description | Retention |
|-----------|-------------|-----------|
| **Memory Content** | Text content you explicitly store via `store_memory` | Until deleted by user |
| **Extracted Features** | People mentioned, topics, emotions, action items | Same as parent memory |
| **Salience Scores** | Computed importance scores (0-100) | Same as parent memory |
| **Context Frames** | Location, activity, people present at time of storage | 30 days rolling window |
| **Open Loops** | Commitments and follow-ups extracted from memories | Until closed or deleted |
| **Timeline Events** | Dates and events mentioned in memories | Same as parent memory |
| **Pattern Data** | Learned behavioral patterns (after 21 days of usage) | Indefinite, or until reset |

### Technical Data
| Data Type | Description | Retention |
|-----------|-------------|-----------|
| **Device Context** | Device ID, device type, timestamps | 24 hours (active session) |
| **Usage Metrics** | Tool invocation counts, response times | 90 days (aggregated) |
| **Error Logs** | Error messages and stack traces | 30 days |

### Data We Do NOT Collect
- Raw audio or video content
- Biometric data
- Financial account credentials
- Health records (unless explicitly stored by user)
- Location GPS coordinates (only semantic locations like "office", "home")

## How We Use Your Data

### Primary Uses
1. **Memory Storage & Retrieval**: Store and search your memories based on relevance and salience
2. **Commitment Tracking**: Extract and track open loops (things you owe others / they owe you)
3. **Pre-Conversation Briefings**: Generate contextual briefings about people before meetings
4. **Predictive Memory**: Learn patterns over 21 days to surface relevant information proactively
5. **Multi-Device Sync**: Fuse context across devices for unified memory access

### We Never
- Sell your data to third parties
- Use your data for advertising
- Train AI models on your personal memories without explicit consent
- Share individual user data with other users

## Data Storage & Security

### Self-Hosted Deployments
When you self-host MemoRable:
- All data remains on your infrastructure
- MongoDB stores encrypted memories (encryption at rest recommended)
- Redis stores ephemeral context frames (no persistence by default)
- You control all backup and retention policies

### AWS Cloud Deployments
When deployed to AWS:
- Data stored in Amazon DocumentDB (MongoDB-compatible) with encryption at rest
- Context frames stored in Amazon ElastiCache (Redis) with encryption in transit
- All traffic encrypted via TLS 1.2+
- VPC isolation with private subnets
- IAM-based access control

### OAuth Authentication
For Claude.ai web integration:
- OAuth 2.0 tokens are JWT-signed and expire after 1 hour
- Refresh tokens expire after 7 days
- Token storage can be configured for Redis (recommended for production)

## Data Retention & Deletion

### Automatic Retention
| Data Type | Default Retention |
|-----------|------------------|
| Active memories | Indefinite |
| Suppressed memories | Indefinite (hidden from search) |
| Archived memories | Indefinite (excluded from default queries) |
| Deleted memories | 30 days (then permanently removed) |
| Context frames | 24-hour rolling window |
| Pattern data | Indefinite |

### User Rights

#### Right to Access
Export all your data using:
```
export_memories({ includeLoops: true, includeTimeline: true })
```

#### Right to Deletion
Delete specific memories:
```
forget({ memoryId: "xxx", mode: "delete" })
```

Delete all memories involving a person:
```
forget_person({ person: "John Doe", mode: "delete", alsoForgetLoops: true })
```

#### Right to Rectification
Modify memory associations:
```
reassociate({ memoryId: "xxx", removePeople: ["Wrong Name"], addPeople: ["Correct Name"] })
```

#### Right to Data Portability
Export your memories in JSON format for transfer to another system:
```
export_memories({ fromDate: "2024-01-01", toDate: "2024-12-31" })
```

## Third-Party Services

MemoRable may connect to the following third-party services:

| Service | Purpose | Data Shared |
|---------|---------|-------------|
| **AWS Bedrock** | LLM for feature extraction | Memory text (for processing only) |
| **Anthropic API** | LLM for feature extraction | Memory text (for processing only) |
| **OpenAI API** | LLM for feature extraction | Memory text (for processing only) |

LLM providers process data according to their own privacy policies. Data is sent only for real-time processing and is not retained by these providers beyond their stated processing purposes.

## Children's Privacy

MemoRable is not intended for use by individuals under 13 years of age. We do not knowingly collect personal information from children.

## International Data Transfers

For self-hosted deployments, data remains in your chosen jurisdiction. For AWS deployments, data is stored in your selected AWS region. Cross-region replication is user-configurable.

## Changes to This Policy

We will notify users of material changes to this privacy policy via:
- GitHub repository changelog
- Release notes
- (For MCP Directory users) Anthropic notification system

## Contact

For privacy inquiries:
- **GitHub Issues**: https://github.com/alanchelmickjr/memoRable/issues
- **Email**: [Your contact email]

## Compliance

MemoRable is designed to support compliance with:
- **GDPR** (General Data Protection Regulation)
- **CCPA** (California Consumer Privacy Act)
- **SOC 2** (when deployed with appropriate AWS configurations)

For specific compliance requirements, please consult with your legal team regarding your self-hosted or cloud deployment configuration.

---

*This privacy policy applies to MemoRable version 2.0.0 and later.*
