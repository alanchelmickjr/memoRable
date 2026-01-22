# Engine Layer Design

## Problem Statement

Flat search finds needles. Graph shows paths. Neither answers:
- "What do we have for this use case?"
- "What is this code actually used for?"
- "Why are there 3 implementations of the same thing?"

The Engine bridges intention and implementation bidirectionally.

## The Three Questions

1. **Use Case → Implementation**: "I need auth" → finds all auth code
2. **Implementation → Use Case**: "What does this auth code do?" → finds business purpose
3. **Quality Gate**: "Is this good?" → engineering review before shipping

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         ENGINE                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────────┐         ┌──────────────┐                 │
│   │  USE CASES   │◄───────►│   IMPL MAP   │                 │
│   │              │         │              │                 │
│   │ - auth       │         │ - OAuth.ts   │                 │
│   │ - payments   │         │ - JWT.ts     │                 │
│   │ - search     │         │ - Auth0.ts   │                 │
│   └──────────────┘         └──────────────┘                 │
│          │                        │                          │
│          └────────┬───────────────┘                          │
│                   ▼                                          │
│          ┌──────────────┐                                    │
│          │   ANALYZER   │                                    │
│          │              │                                    │
│          │ - duplicates │                                    │
│          │ - gaps       │                                    │
│          │ - conflicts  │                                    │
│          └──────────────┘                                    │
│                   │                                          │
│                   ▼                                          │
│          ┌──────────────┐                                    │
│          │ QUALITY GATE │                                    │
│          │              │                                    │
│          │ - security   │                                    │
│          │ - patterns   │                                    │
│          │ - standards  │                                    │
│          └──────────────┘                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Component 1: Bidirectional Mapper

### Forward: Use Case → Implementation

Input: Natural language intent
Output: Ranked list of relevant code

```
Query: "How do we handle user authentication?"

Results:
1. src/auth/oauth.ts (OAuth 2.0 flow) - 92% match
2. src/auth/jwt.ts (token validation) - 87% match
3. src/middleware/auth.ts (route protection) - 85% match
4. src/auth/auth0.ts (Auth0 integration) - 78% match
```

### Reverse: Implementation → Use Case

Input: File or function path
Output: Business purpose and usage context

```
Query: "What is src/auth/auth0.ts used for?"

Results:
- Purpose: Third-party SSO integration
- Used by: Enterprise customers (see docs/enterprise.md)
- Related: src/auth/oauth.ts shares token flow
- Note: Appears to duplicate oauth.ts functionality
```

### Mapping Strategy

Three approaches, ranked by complexity:

1. **Comment/Docstring Mining** (simple)
   - Parse JSDoc, docstrings, inline comments
   - Link to use case keywords
   - Low accuracy, high coverage

2. **LLM Summarization** (moderate)
   - Feed code chunks to LLM
   - Generate purpose statements
   - Store as searchable metadata
   - Higher accuracy, slower indexing

3. **Semantic Code Embedding** (advanced)
   - Embed code with code-specific models (CodeBERT, StarCoder)
   - Embed use case descriptions with text model
   - Cross-modal similarity search
   - Highest accuracy, most complex

**Recommendation**: Start with #2 (LLM summarization) since we already have LLM infrastructure. Can add #3 later for precision.

## Component 2: Analyzer

Surfaces patterns that indicate problems:

### Duplication Detection

```
FINDING: 3 implementations of JWT validation

1. src/auth/jwt.ts:validateToken()
2. src/middleware/auth.ts:checkJWT()
3. src/utils/token.ts:verifyToken()

Similarity: 87% (likely copy-paste with modifications)
Recommendation: Consolidate to single source
```

### Gap Analysis

```
FINDING: Use case without implementation

Use case: "Rate limiting for API endpoints" (from docs/api.md)
Implementation: None found
Related: src/middleware/ has auth but no rate limiting

Recommendation: Add rate limiting middleware
```

### Conflict Detection

```
FINDING: Conflicting implementations

src/config/auth.ts: TOKEN_EXPIRY = "1h"
src/auth/jwt.ts: TOKEN_EXPIRY = "24h"

Both used in production paths
Recommendation: Centralize configuration
```

### Pattern Library

Common anti-patterns to detect:
- Multiple sources of truth
- Dead code (implemented but unreferenced)
- Orphan docs (documented but not implemented)
- Version drift (dependencies out of sync)
- Security smells (hardcoded secrets, SQL concatenation)

## Component 3: Quality Gate

Engineering review automation. Runs before code ships.

### Three Passes

1. **Static Analysis**
   - Lint rules
   - Type checking
   - Security scanning (SAST)
   - Dependency vulnerabilities

2. **Semantic Analysis** (LLM-powered)
   - "Does this code do what the PR description says?"
   - "Are there edge cases not handled?"
   - "Does this match our patterns?"

3. **Context Analysis**
   - "How does this change affect related code?"
   - "Are there breaking changes to consumers?"
   - "Does documentation need updating?"

### Integration Points

```yaml
# .github/workflows/engine-review.yml
on: pull_request

jobs:
  engine-review:
    steps:
      - name: Run Engine Analysis
        run: npm run engine:review

      - name: Post Findings
        uses: engine/pr-comment@v1
        with:
          findings: ${{ steps.analysis.outputs.findings }}
```

## Data Model

### Use Case Record

```json
{
  "id": "uc-auth-001",
  "name": "User Authentication",
  "description": "Verify user identity before granting access",
  "keywords": ["auth", "login", "session", "jwt", "oauth"],
  "docs": ["docs/auth.md", "README.md#authentication"],
  "implementations": ["impl-auth-001", "impl-auth-002"],
  "status": "implemented",
  "owner": "security-team"
}
```

### Implementation Record

```json
{
  "id": "impl-auth-001",
  "file": "src/auth/oauth.ts",
  "functions": ["authorize", "callback", "refresh"],
  "summary": "OAuth 2.0 authorization code flow with PKCE",
  "use_cases": ["uc-auth-001"],
  "dependencies": ["express", "jose"],
  "last_modified": "2025-01-15",
  "quality_score": 87,
  "issues": []
}
```

### Finding Record

```json
{
  "id": "finding-001",
  "type": "duplication",
  "severity": "medium",
  "title": "Multiple JWT validation implementations",
  "description": "Found 3 functions that validate JWT tokens with 87% similarity",
  "locations": [
    "src/auth/jwt.ts:45",
    "src/middleware/auth.ts:23",
    "src/utils/token.ts:12"
  ],
  "recommendation": "Consolidate to single validateToken() in src/auth/jwt.ts",
  "auto_fixable": false
}
```

## Research: Existing Tools

### Code Intelligence
- **CodeQL** (GitHub): Semantic code analysis, security scanning
- **Sourcegraph**: Code search, cross-repo navigation
- **Understand** (SciTools): Architecture visualization

### Knowledge Graphs
- **Neo4j**: Graph database for code relationships
- **code2prompt**: Converts repos to LLM-friendly format

### Quality Gates
- **SonarQube**: Static analysis, quality metrics
- **CodeClimate**: Maintainability scoring
- **Snyk**: Security vulnerabilities

### LLM-Based Review
- **CodeRabbit**: AI PR review
- **Sourcery**: Python-focused AI review
- **Amazon CodeGuru**: AWS-native code review

**Key Insight**: No existing tool does bidirectional use case ↔ implementation mapping. This is the novel contribution.

## Implementation Phases

### Phase 1: Indexing (prerequisite - see REPO_INDEXING_DESIGN.md)
Build flat search and basic graph. Engine depends on this foundation.

### Phase 2: Use Case Extraction
- Scan docs for use case patterns
- LLM-summarize each significant code file
- Build initial mapping

### Phase 3: Analyzer
- Implement duplication detection (AST comparison + embedding similarity)
- Add gap analysis (use cases without implementations)
- Add conflict detection (config divergence)

### Phase 4: Quality Gate
- Integrate with CI/CD
- Add PR comment bot
- Build dashboard for findings

## Open Questions

1. **Granularity**: Map at file level, function level, or both?
2. **Update Frequency**: Re-index on every commit or periodic batch?
3. **Human Override**: How to handle false positives in findings?
4. **Priority Scoring**: How to rank findings by importance?

## Success Metrics

- Time to find relevant code: < 30 seconds
- False positive rate on findings: < 10%
- Duplicates detected before merge: > 80%
- Developer satisfaction: "This actually helps"

## Next Steps

1. Alan reviews this document
2. Refine based on feedback
3. Begin Phase 1 (Flat Search) implementation
4. Iterate toward Engine

---

*"Why are there 3 auth implementations?" - The question that started it all.*
