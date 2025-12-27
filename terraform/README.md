# MemoRable Terraform Infrastructure

Infrastructure as Code for deploying MemoRable to AWS.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS Cloud                                 │
│                                                                  │
│  ┌──────────┐     ┌──────────┐     ┌───────────────────────┐   │
│  │ Route 53 │────▶│   ALB    │────▶│    ECS Fargate        │   │
│  │  (DNS)   │     │(HTTPS/80)│     │  ┌─────────────────┐  │   │
│  └──────────┘     └──────────┘     │  │ memorable-app   │  │   │
│                                     │  │ (port 3000)     │  │   │
│                                     │  ├─────────────────┤  │   │
│                                     │  │ ingestion-svc   │  │   │
│                                     │  │ (port 8001)     │  │   │
│                                     │  └─────────────────┘  │   │
│                                     └───────────────────────┘   │
│                                              │                   │
│  ┌─────────────┐                            │                   │
│  │  Secrets    │◀───────────────────────────┤                   │
│  │  Manager    │                            │                   │
│  └─────────────┘                            ▼                   │
│                        ┌─────────────────────────────────────┐  │
│                        │           Data Layer                 │  │
│                        │  ┌───────────┐  ┌───────────────┐   │  │
│                        │  │ DocumentDB│  │  ElastiCache  │   │  │
│                        │  │ (MongoDB) │  │   (Redis)     │   │  │
│                        │  └───────────┘  └───────────────┘   │  │
│                        └─────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    VPC (10.0.0.0/16)                      │   │
│  │  ┌────────────────┐           ┌────────────────────────┐ │   │
│  │  │ Public Subnets │           │    Private Subnets     │ │   │
│  │  │ (NAT, ALB)     │           │ (ECS, DBs)             │ │   │
│  │  └────────────────┘           └────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Terraform >= 1.0
3. Docker (for building images)

## Quick Start

### 1. Bootstrap Terraform Backend

```bash
# Create S3 bucket and DynamoDB table for state
./scripts/terraform-bootstrap.sh staging
```

### 2. Initialize Terraform

```bash
cd terraform
terraform init -backend-config="bucket=memorable-terraform-state-staging"
```

### 3. Plan and Apply

```bash
# Set your API keys
export TF_VAR_anthropic_api_key="sk-ant-xxx"

# Plan
terraform plan -var-file="environments/staging.tfvars"

# Apply
terraform apply -var-file="environments/staging.tfvars"
```

## Environments

| Environment | File | Description |
|-------------|------|-------------|
| staging | `environments/staging.tfvars` | Lower cost, single AZ, smaller instances |
| production | `environments/production.tfvars` | HA, multi-AZ, larger instances |

## Modules

| Module | Purpose |
|--------|---------|
| `vpc` | VPC, subnets, NAT gateways, route tables |
| `documentdb` | DocumentDB cluster (MongoDB-compatible) |
| `elasticache` | Redis cluster with auth |
| `alb` | Application Load Balancer with HTTPS |
| `ecs` | ECS cluster, services, task definitions, auto-scaling |
| `secrets` | Secrets Manager + IAM roles |

## Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key (optional) |

## Costs (Estimated)

### Staging (~$150-200/month)
- DocumentDB: db.t3.medium (1 instance)
- ElastiCache: cache.t3.micro (1 node)
- ECS Fargate: 0.5 vCPU, 1GB (1 task)
- NAT Gateway: 2 AZs
- ALB: 1

### Production (~$800-1200/month)
- DocumentDB: db.r5.large (2 instances)
- ElastiCache: cache.r5.large (2 nodes)
- ECS Fargate: 1 vCPU, 2GB (2+ tasks, auto-scaling)
- NAT Gateway: 3 AZs
- ALB: 1

## Destroying Infrastructure

```bash
# DANGER: This will delete everything
terraform destroy -var-file="environments/staging.tfvars"
```

## Troubleshooting

### State Lock Issues
```bash
terraform force-unlock <LOCK_ID>
```

### ECS Service Not Starting
```bash
# Check CloudWatch logs
aws logs tail /ecs/memorable-staging/app --follow
```

### DocumentDB Connection Issues
- Ensure security groups allow traffic from ECS
- Check if TLS is required (it is by default)
- Verify connection string includes `?tls=true&replicaSet=rs0`
