# MemoRable Deployment Diagnostic

> **DEPRECATED (Feb 2026):** Historical record of the old ALB/ECS/Fargate/DocumentDB stack. Replaced by EC2 + Elastic IP + MongoDB Atlas (~$11/mo). See `cloudformation/memorable-ec2-stack.yaml` for current architecture.

**Date:** 2026-01-21
**Problem:** "Cut out part of the quilt, now we have a hole and two patches"

---

## THE QUILT (What Should Exist)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ORIGINAL WORKING SYSTEM                              │
│                                                                              │
│   CloudFormation Stack (us-west-2)                                          │
│   ─────────────────────────────────                                         │
│   • One-click deploy button in README                                       │
│   • memorable-stack.yaml                                                    │
│   • ALB: 52.9.62.72:8080 (EC2 Elastic IP)              │
│   • DocumentDB (persistent storage)                                         │
│   • ElastiCache (Redis)                                                     │
│   • ECS Fargate                                                             │
│   • CodeBuild (auto-builds on deploy)                                       │
│                                                                              │
│   THIS WAS WORKING. Data persisted. API keys worked across restarts.        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## THE HOLE (What Broke)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              THE PROBLEM                                     │
│                                                                              │
│   CloudFormation Stack (us-west-2) - NOW BROKEN                             │
│   ─────────────────────────────────────────────                             │
│                                                                              │
│   ECS Task is running BUT:                                                  │
│   • MONGODB_URI not connecting (TLS? creds? security group?)               │
│   • Server falls back to IN-MEMORY mode                                     │
│   • Every task restart = ALL DATA LOST                                      │
│   • Old API key (hKiToQUchIAx8bwi5Y00RWVYN6ZxRzAk) = DEAD                  │
│   • Passphrase auth works but creates ephemeral keys                        │
│                                                                              │
│   Evidence:                                                                  │
│   • Only 1 memory in DB (from this session's test)                         │
│   • Server uptime: ~6 hours (last restart wiped everything)                │
│   • No "memorable" entity memories (project context gone)                   │
│                                                                              │
│   Root Cause: Unknown. Need AWS console access to diagnose:                 │
│   • Is DocumentDB running?                                                  │
│   • Is the secret populated?                                                │
│   • Can ECS reach DocumentDB (security groups)?                            │
│   • What does ECS task log show?                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## THE TWO PATCHES (What Got Added Instead of Fixing)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PATCH 1: Terraform Staging                         │
│                                                                              │
│   terraform/environments/staging.tfvars (us-east-1)                         │
│   ─────────────────────────────────────────────────                         │
│                                                                              │
│   • DIFFERENT REGION than CloudFormation (us-east-1 vs us-west-2)          │
│   • DIFFERENT infrastructure (Terraform modules vs CloudFormation)          │
│   • Was added for CI/CD automation                                          │
│   • May or may not be deployed                                              │
│                                                                              │
│   Recent changes (potentially problematic):                                  │
│   • 2425383 - "fix: populate mongodb secret" - added resource that          │
│               may conflict or be unnecessary                                 │
│   • 3e311d5 - "skip_final_snapshot for staging" - staging-specific         │
│                                                                              │
│   STATUS: Unknown if deployed. If deployed, separate from CloudFormation.   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         PATCH 2: Terraform Production                        │
│                                                                              │
│   terraform/environments/production.tfvars (us-east-1)                      │
│   ─────────────────────────────────────────────────                         │
│                                                                              │
│   • Also us-east-1                                                          │
│   • Larger instance sizes                                                   │
│   • app_image = "" (not set = not deployed?)                               │
│                                                                              │
│   STATUS: Likely not deployed. Just config files.                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## THE CONFUSION

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WHERE CLAUDE GOT LOST                              │
│                                                                              │
│   1. CloudFormation (us-west-2) = THE LIVE SYSTEM                           │
│      - Was working                                                           │
│      - Has DocumentDB, but something broke the connection                    │
│                                                                              │
│   2. Terraform (us-east-1) = SEPARATE SYSTEM FOR CI/CD                      │
│      - Not the live system                                                   │
│      - Changes here DON'T FIX CloudFormation                                │
│                                                                              │
│   3. Claude made terraform changes (2425383) thinking it would help         │
│      - It doesn't help CloudFormation                                        │
│      - May have broken terraform staging                                     │
│      - "Fixed" the wrong system                                             │
│                                                                              │
│   Result: Two incomplete systems, neither fully working                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## WHAT ACTUALLY NEEDS TO HAPPEN

### Step 1: Diagnose CloudFormation (us-west-2)

```bash
# Check DocumentDB status
aws docdb describe-db-clusters --region us-west-2

# Check the MongoDB secret
aws secretsmanager get-secret-value \
  --secret-id memorable/mongodb \
  --region us-west-2

# Check ECS task logs
aws logs tail /ecs/memorable --region us-west-2 --since 1h

# Check ECS task environment
aws ecs describe-task-definition \
  --task-definition memorable \
  --region us-west-2 | grep -A5 MONGODB_URI
```

### Step 2: Fix CloudFormation (if fixable)

If DocumentDB exists and secret is populated:
```bash
# Force new deployment to pick up correct env vars
aws ecs update-service \
  --cluster memorable-cluster \
  --service memorable-service \
  --force-new-deployment \
  --region us-west-2
```

If DocumentDB or secret is broken:
```bash
# Update the CloudFormation stack
aws cloudformation update-stack \
  --stack-name memorable \
  --template-body file://cloudformation/memorable-stack.yaml \
  --capabilities CAPABILITY_IAM \
  --region us-west-2
```

### Step 3: Decide About Terraform

Options:
1. **Delete terraform entirely** - if CloudFormation is the only system needed
2. **Keep terraform separate** - for future staging/production CI/CD, but DON'T conflate with CloudFormation
3. **Migrate to terraform** - replace CloudFormation entirely (big effort)

---

## INVENTORY

| System | Region | Status | Purpose |
|--------|--------|--------|---------|
| CloudFormation | us-west-2 | BROKEN (in-memory mode) | Live system, one-click deploy |
| Terraform staging | us-east-1 | Unknown | CI/CD staging |
| Terraform production | us-east-1 | Not deployed | CI/CD production |

| Data Store | Should Exist | Verified Working |
|------------|--------------|------------------|
| DocumentDB (CF) | Yes | NO - not connecting |
| ElastiCache (CF) | Yes | Unknown |
| ECR images | Yes | Yes (server runs) |

| API Endpoint | Status |
|--------------|--------|
| /health | ✅ Working |
| /auth/knock | ✅ Working |
| /auth/exchange | ✅ Working (in-memory) |
| /memory | ✅ Working (in-memory, ephemeral) |
| Old API key | ❌ Dead (lost on restart) |

---

## LESSON

> Map the quilt before cutting.
>
> CloudFormation ≠ Terraform
> us-west-2 ≠ us-east-1
> Live system ≠ CI/CD system

---

*Diagnostic by Claude - 2026-01-21*
