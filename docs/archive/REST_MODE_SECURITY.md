# REST Mode Security - Transit Encryption

> **DEPRECATED (Feb 2026):** This doc references the old ALB/DocumentDB architecture. Current stack is EC2 + Elastic IP + MongoDB Atlas + MCP StreamableHTTP. DocumentDB was dropped for Atlas. ALB was dropped for direct EC2.

> **SECURITY HIERARCHY**
>
> 1. HTTP: **NEVER** - blocked at code level
> 2. HTTPS: **TEMPORARY** - minimum floor while bastion is built
> 3. Bastion: **TARGET** - the real secure solution
>
> HTTPS can be circumvented (fake certs, compromised CAs, MITM proxies).
> It's the minimum acceptable for MCP to function while we build proper infrastructure.

## Current State: HTTPS (Temporary)

```
┌─────────────┐      HTTPS (TLS 1.3)        ┌─────────────┐
│ Claude Code │ ════════════════════════════ │  AWS ALB    │
│   (local)   │   ⚠️ Temporary measure       │  (remote)   │
└─────────────┘                              └─────────────┘
```

### HTTPS Limitations - The "S" is Cosmetic

**How trivial is HTTPS to bypass?**

```
Your Machine                    Attacker (any hop)                 AWS
     │                                │                              │
     │──── HTTPS request ────────────▶│                              │
     │                                │ (decrypt with fake cert)     │
     │                                │ (read/modify everything)     │
     │                                │ (re-encrypt, add the "s")    │
     │                                │──── HTTPS request ──────────▶│
     │                                │                              │
     │                                │◀─── HTTPS response ──────────│
     │                                │ (decrypt, read, re-encrypt)  │
     │◀─── HTTPS response ────────────│                              │
```

Tools that do this trivially:
- **Java proxies** - Enterprise standard, inject root cert, done
- **mitmproxy** - `pip install mitmproxy`, one command
- **Burp Suite** - Point and click MITM
- **Corporate "SSL inspection"** - Your employer probably does this now

The attacker just:
1. Installs a root CA on client (or compromises one)
2. Intercepts the stream
3. Decrypts, reads everything, re-encrypts
4. Slaps the "s" back on and forwards it

**The "S" in HTTPS means nothing when any hop is compromised.**

- ❌ Fake certificates can MITM the connection
- ❌ Compromised CAs can issue fraudulent certs
- ❌ Corporate proxies can SSL-strip or MITM
- ❌ Local malware can inject root certs
- ✅ Better than HTTP (blocks passive sniffing only)
- ✅ Allows MCP to work while we build real security

### What's Encrypted (With Known Limitations)
- ✅ **At Rest**: DocumentDB `StorageEncrypted: true`
- ✅ **DB Transit**: DocumentDB `tls=true` (inside VPC, trusted)
- ⚠️ **Client Transit**: HTTPS (can be circumvented)
- ✅ **Internal AWS**: VPC traffic (trusted network)

## Why No HTTP

HTTP is blocked at the code level. No exceptions. No "development mode."

```
Your Machine → Home Router → ISP → Internet Backbone → AWS
                  ↑            ↑           ↑
          With HTTP, EVERYONE reads your data
```

## HTTPS Setup (Temporary Solution)

### Step 1: Get a Domain
```bash
# Options:
# - Buy a domain (Route53, Namecheap, etc.)
# - Use a subdomain you already own
# Example: api.memorable.yourdomain.com
```

### Step 2: Create ACM Certificate
```bash
# Via AWS Console:
# 1. Go to AWS Certificate Manager
# 2. Request a public certificate
# 3. Add domain name (e.g., api.memorable.yourdomain.com)
# 4. Choose DNS validation
# 5. Create CNAME record in your DNS
# 6. Wait for validation (usually minutes)

# Or via CLI:
aws acm request-certificate \
  --domain-name api.memorable.yourdomain.com \
  --validation-method DNS \
  --region us-west-2
```

### Step 3: Update CloudFormation Stack
```bash
aws cloudformation update-stack \
  --stack-name memorable \
  --template-body file://cloudformation/memorable-stack.yaml \
  --parameters \
    ParameterKey=CertificateArn,ParameterValue=arn:aws:acm:us-west-2:xxx:certificate/xxx \
  --capabilities CAPABILITY_NAMED_IAM
```

### Step 4: Update DNS
Point your domain to the ALB:
```bash
# Create CNAME or ALIAS record:
# api.memorable.yourdomain.com → memorable-alb-xxx.us-west-2.elb.amazonaws.com
```

### Step 5: Set Client Config
```bash
# REST mode will now work (HTTPS required):
export API_BASE_URL=https://api.memorable.yourdomain.com
```

## Security Guarantees

With HTTPS configured:
- ✅ TLS 1.3 with 1.2 fallback (ELBSecurityPolicy-TLS13-1-2-2021-06)
- ✅ HTTP automatically redirects to HTTPS
- ✅ API keys encrypted in transit
- ✅ Memory content encrypted in transit
- ✅ API client rejects any http:// URLs
5. **Monitor for anomalies** - Watch for unexpected API access

## Alternative: Direct Mode (More Secure)

If you can establish VPN/bastion access to the VPC:

```bash
# Unset API_BASE_URL to use direct MongoDB connection
unset API_BASE_URL

# Set MongoDB URI to DocumentDB endpoint (requires VPN)
export MONGODB_URI="mongodb://user:pass@docdb-endpoint:27017/memorable?tls=true&replicaSet=rs0"
```

Direct mode is more secure because:
- DocumentDB enforces TLS
- No public internet exposure
- VPC security groups limit access

## Access Modes (Priority Order)

| Mode | Status | Security | Notes |
|------|--------|----------|-------|
| **Bastion Host** | **PRIORITY** | 🔒 Secure | Target solution - build ASAP |
| Direct Mode (VPN) | Available | 🔒 Secure | For those with VPC access |
| WebSocket Mode | Future | 🔒 Secure | Real-time, post-bastion |
| REST/HTTPS | Temporary | ⚠️ Limited | Works now, HTTPS can be bypassed |
| HTTP | **BLOCKED** | ❌ None | Code rejects http:// URLs |

**HTTPS is a stopgap. Bastion is the goal.**

### When HTTPS is Acceptable (Local Dev Only)
- Local docker-compose talking to localhost (no network exposure)
- Development machine on trusted network with self-signed cert
- Testing before bastion is ready

### When Bastion is Required (Production)
- Any remote MCP access over internet
- Any environment with sensitive data
- Any production deployment

## TASK: Bastion Host System

> **PRIORITY: CRITICAL**
>
> This is not optional. HTTPS REST mode is a temporary measure.
> Bastion provides actual security, not just encrypted-but-bypassable transit.

Implement a bastion/jump host for secure access to internal resources:

### Requirements
1. **SSH Tunnel Access** - Secure path to DocumentDB/Redis without public exposure
2. **Session Recording** - Audit trail of all access
3. **MFA Required** - No single-factor authentication
4. **Time-Limited Sessions** - Auto-expire after inactivity
5. **IP Allowlisting** - Restrict source IPs

### Options to Evaluate

#### Option A: AWS Systems Manager Session Manager
```bash
# No bastion EC2 needed, uses SSM agent
aws ssm start-session --target i-xxx --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["27017"],"localPortNumber":["27017"]}'
```
- ✅ No public IPs exposed
- ✅ IAM-based access control
- ✅ Session logging to CloudWatch
- ✅ No SSH keys to manage

#### Option B: Traditional Bastion Host
```yaml
# CloudFormation addition
BastionHost:
  Type: AWS::EC2::Instance
  Properties:
    InstanceType: t3.micro
    SubnetId: !Ref PublicSubnet1
    SecurityGroupIds:
      - !Ref BastionSecurityGroup
    # Hardened AMI, fail2ban, etc.
```
- ✅ Full control
- ⚠️ Requires maintenance
- ⚠️ SSH key management

#### Option C: AWS Client VPN
```yaml
ClientVpnEndpoint:
  Type: AWS::EC2::ClientVpnEndpoint
  Properties:
    AuthenticationOptions:
      - Type: certificate-authentication
    ConnectionLogOptions:
      Enabled: true
```
- ✅ Full VPC access
- ✅ Works with any client
- ⚠️ More complex setup
- ⚠️ Per-connection costs

### Recommendation
Start with **SSM Session Manager** (Option A):
- Zero infrastructure to maintain
- Native AWS security integration
- Can port-forward to DocumentDB
- Enables direct mode from local machine securely

### Implementation Steps
1. Add SSM IAM policies to CloudFormation
2. Install SSM agent on ECS tasks (or use Fargate exec)
3. Create port-forwarding document for DocumentDB
4. Document secure access procedure
5. Remove HTTP REST mode once bastion is operational

## Related Files

- `src/services/mcp_server/api_client.ts` - REST mode client
- `src/services/mcp_server/index.ts` - Mode detection and routing
- `cloudformation/memorable-stack.yaml` - HTTPS listener config
- `.env.example` - REST mode configuration

---

**Remember: HTTP REST mode is proof of concept. Upgrade to HTTPS before any real use.**
