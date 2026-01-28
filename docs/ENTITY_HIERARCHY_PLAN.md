# Entity Hierarchy & Context Boundaries

## The Model

```
alan (master entity)
├── memorable_project (sub-entity)
│   └── sees ONLY its own loops, docs, context
├── android_bot (sub-entity)
│   └── sees ONLY its own loops, docs, context
└── personal (sub-entity)
    └── private stuff
```

## Rules

1. **Master sees all, children see only themselves**
2. **Context determined by CWD** - git remote → entity name
3. **Queries scoped by entity** - `/loops?entity=X` returns only X's loops
4. **New repo = new sub-entity** - auto-created on first session

## Implementation

- `MASTER_ENTITY` env var (default: alan)
- Hook detects repo → creates sub-entity under master
- All queries include `entity` param
- Server filters by entity

## Multi-tenant Ready

Each user is their own master. Their repos are sub-entities. No cross-user visibility.
