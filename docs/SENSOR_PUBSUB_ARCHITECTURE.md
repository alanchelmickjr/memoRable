# Sensor Pub/Sub Architecture

> Real-time memory ingestion from multiple sensors for one or many users.
> AR glasses, companion robots, pendants, toys, vehicles - all feeding the memory stream.

## North Star: The 100ms That Matters

```
T+0ms:    TIRE BLOWS on highway
          ├── Vehicle sensors: catastrophic pressure loss detected
          ├── Vehicle AI: emergency mode engaged
          │
T+10ms:   CHILD DETECTED in road ahead
          ├── Vehicle vision: small human, trajectory analysis
          ├── Vehicle AI: collision imminent without intervention
          │
T+15ms:   PARALLEL ACTIONS BEGIN (not sequential - PARALLEL)
          │
          ├── [THREAD 1] VEHICLE CONTROL
          │   ├── AI calculates controlled drift vector
          │   ├── Steer AWAY from child
          │   ├── Brake modulation for stability on blown tire
          │   └── Execute maneuver
          │
          ├── [THREAD 2] EMERGENCY SERVICES
          │   ├── Dial 911: "Automated emergency: vehicle incident"
          │   ├── Transmit: GPS, vehicle type, occupant count
          │   ├── Dial AAA: Tire service needed post-incident
          │   └── Queue ambulance (probable impact)
          │
          └── [THREAD 3] HOME ALERT (same moment, different location)
              ├── Grandma's pendant: FALL DETECTED at home
              ├── Home robot: Moving to Betty, camera active
              ├── Push to AR glasses: "BETTY DOWN - LIVE FEED"
              └── Driver sees grandma on HUD while handling emergency
          │
T+50ms:   Vehicle completing controlled drift, child safe
T+80ms:   911 dispatcher receiving automated report
T+100ms:  Driver has eyes on Betty via glasses, knows she's conscious
T+200ms:  Vehicle stopped safely, all parties notified

EVERYTHING IN PARALLEL. EVERYTHING IN 200ms. LIVES SAVED.
```

**This is why we're building this. Not for demos. For this moment.**

---

## The Problem

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  AR Glasses  │  │    Robot     │  │   Pendant    │  │  Smart Home  │
│  (Omi/Betty) │  │  (Companion) │  │   (Buddi)    │  │   Sensors    │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │                 │
       │    How do we combine these in real-time?            │
       │    Different rates, different data types,           │
       │    different trust levels, one or many users?       │
       │                 │                 │                 │
       └─────────────────┴─────────────────┴─────────────────┘
```

## Scenarios

### Scenario 1: Single User, Multiple Sensors (Betty's Glasses + Companion)

```
Betty (Alzheimer's patient):
├── AR Glasses (Omi) → Visual context, face recognition, location
├── Companion Doll → Conversation, emotional state, voice
└── Pendant (Buddi) → Vitals, fall detection, emergency

All sensors → Single user memory → Single salience calculation
```

**Requirements:**
- Sensor fusion: Combine visual + audio + vitals into unified context
- Temporal alignment: Events from different sensors at same moment
- Priority: Medical sensors (pendant) override entertainment (companion)
- Latency: Sub-second for safety-critical (falls), relaxed for memory storage

### Scenario 2: Multiple Users, Shared Space (Family Home)

```
Living Room:
├── Smart Home Sensors → Shared context (who's home, activity)
├── Alan's Glasses → Alan's perspective
├── Betty's Pendant → Betty's vitals
└── Companion Robot → Interacts with both

Memories belong to:
├── Alan: His perspective + shared context
├── Betty: Her perspective + shared context
└── Shared: Family events (dinner, conversations)
```

**Requirements:**
- User isolation: My glasses don't write to your memory
- Shared context: Some events are multi-user (family dinner)
- Privacy boundaries: Betty's medical data != Alan's business data
- Consent: Who can see shared memories?

### Scenario 3: Fleet Deployment (Care Facility)

```
Memory Care Facility:
├── 50 residents, each with pendant + optional glasses
├── 10 companion robots (shared, move between residents)
├── Facility-wide sensors (common areas)
└── Staff devices (tablets, badges)

Scale:
├── 50+ concurrent users
├── 100+ sensors
├── 1000s of events/minute
└── Real-time safety alerts
```

**Requirements:**
- Horizontal scale: Add users/sensors without redesign
- Isolation: Resident A's memories separate from Resident B
- Shared resources: Robots serve multiple residents
- Compliance: HIPAA, audit trails, data retention

### Scenario 4: Mobile + Disconnected (Vehicle/Travel)

```
Alan traveling:
├── Phone → Primary sensor when glasses unavailable
├── Vehicle sensors → Location, driving context
├── Offline capability → No internet in tunnel/flight
└── Sync on reconnect → Merge offline memories

Timeline:
├── T0: Online, streaming to cloud
├── T1: Enters tunnel, loses connection
├── T2: Offline memories queue locally
├── T3: Exits tunnel, sync queued memories
└── T4: Cloud reconciles timeline
```

**Requirements:**
- Offline-first: Must work without connectivity
- Conflict resolution: What if cloud and local diverge?
- Bandwidth-aware: Sync when on WiFi, not metered
- Battery-aware: Don't drain device syncing

---

## Architecture Options

### Option A: Centralized Broker (Redis/Kafka)

```
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Sensor1 │ │ Sensor2 │ │ Sensor3 │
└────┬────┘ └────┬────┘ └────┬────┘
     │           │           │
     └───────────┼───────────┘
                 │
                 ▼
        ┌────────────────┐
        │  Message Broker │  ← Redis Streams / Kafka
        │  (Centralized)  │
        └────────┬───────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ User A  │ │ User B  │ │ Shared  │
│ Memory  │ │ Memory  │ │ Context │
└─────────┘ └─────────┘ └─────────┘
```

**Pros:**
- Simple mental model
- Battle-tested (Redis Streams, Kafka)
- Easy to add consumers
- Built-in persistence

**Cons:**
- Single point of failure
- Latency to central broker
- Doesn't work offline
- Cloud dependency

**Best for:** Facility deployments, always-connected scenarios

### Option B: Edge Mesh (Gun.js / CRDT)

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Sensor1 │◄───►│ Sensor2 │◄───►│ Sensor3 │
└────┬────┘     └────┬────┘     └────┬────┘
     │               │               │
     └───────────────┼───────────────┘
                     │
            ┌────────┴────────┐
            │   Edge Mesh     │  ← Gun.js / CRDT
            │ (Decentralized) │
            └────────┬────────┘
                     │
                     ▼ (when online)
            ┌─────────────────┐
            │   Cloud Sync    │
            └─────────────────┘
```

**Pros:**
- Works offline (mesh between local devices)
- No single point of failure
- Real-time local sync (sub-ms latency)
- CRDT handles conflicts automatically

**Cons:**
- More complex to reason about
- Eventual consistency (not immediate)
- Gun.js is... Gun.js (quirky)
- Harder to debug

**Best for:** Mobile users, disconnected scenarios, edge-first

### Option C: Hybrid (Local Broker + Cloud Sync)

```
┌─────────────────────────────────────────┐
│              Local Environment          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Sensor1 │ │ Sensor2 │ │ Sensor3 │   │
│  └────┬────┘ └────┬────┘ └────┬────┘   │
│       │           │           │         │
│       └───────────┼───────────┘         │
│                   │                     │
│                   ▼                     │
│          ┌────────────────┐             │
│          │  Local Broker  │ ← Redis on device/local network
│          └────────┬───────┘             │
│                   │                     │
│       ┌───────────┼───────────┐         │
│       ▼           ▼           ▼         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Local   │ │ Local   │ │ Salience│   │
│  │ Memory  │ │ Context │ │ Scoring │   │
│  └─────────┘ └─────────┘ └─────────┘   │
└────────────────────┬────────────────────┘
                     │
                     │ (async sync when online)
                     ▼
            ┌─────────────────┐
            │   Cloud Store   │
            │  (DocumentDB)   │
            └─────────────────┘
```

**Pros:**
- Best of both worlds
- Local = fast, offline-capable
- Cloud = durable, cross-device
- Can degrade gracefully

**Cons:**
- Two systems to maintain
- Sync logic is complex
- Potential for divergence

**Best for:** General purpose, most scenarios

---

## Pub/Sub Channel Design

### Channel Hierarchy

```
memorable/
├── sensors/
│   ├── {device_id}/raw          → Raw sensor data (high volume)
│   ├── {device_id}/events       → Processed events
│   └── {device_id}/health       → Device health/status
├── users/
│   ├── {user_id}/memories       → Stored memories
│   ├── {user_id}/context        → Current context frame
│   └── {user_id}/alerts         → Real-time alerts
├── shared/
│   ├── {space_id}/presence      → Who's in shared space
│   └── {space_id}/events        → Shared events
└── system/
    ├── sync/requests            → Sync coordination
    └── admin/commands           → System commands
```

### Message Format

```typescript
interface SensorMessage {
  // Identity
  messageId: string;           // Unique message ID
  deviceId: string;            // Source device
  userId: string;              // Owner of this data

  // Timing
  timestamp: string;           // ISO8601 when captured
  receivedAt?: string;         // When broker received (for latency tracking)

  // Content
  type: 'audio' | 'visual' | 'location' | 'vitals' | 'interaction' | 'text';
  payload: unknown;            // Type-specific data

  // Context
  confidence: number;          // 0-1, how reliable is this data
  priority: 'critical' | 'high' | 'normal' | 'low';

  // Security
  securityTier: 'Tier1_General' | 'Tier2_Personal' | 'Tier3_Vault';
  encrypted: boolean;

  // Routing
  targetUsers?: string[];      // For shared events
  ttl?: number;                // Message expiry (ms)
}
```

### Consumer Groups

```
Raw Sensor Data (high volume, ephemeral):
├── Consumer: Context Builder  → Updates real-time context frame
├── Consumer: Alert Detector   → Watches for safety events
└── Consumer: Sampler          → Downsamples for storage

Processed Events (medium volume, persisted):
├── Consumer: Memory Writer    → Stores to MongoDB
├── Consumer: Salience Scorer  → Calculates importance
└── Consumer: Relationship Tracker → Updates social graph

User Memories (low volume, high value):
├── Consumer: Vector Embedder  → Generates embeddings
├── Consumer: Pattern Learner  → Updates temporal patterns
└── Consumer: Sync Service     → Replicates to other devices
```

---

## Real-Time Fusion

### Temporal Alignment

```
Problem: Glasses see face at T=100ms, pendant detects elevated heart rate at T=150ms
         Are these the same event?

Solution: Sliding window fusion

┌─────────────────────────────────────────────────────┐
│                 Fusion Window (500ms)               │
│                                                     │
│  T=0ms    T=100ms   T=150ms   T=300ms   T=500ms    │
│    │         │         │         │         │        │
│    │      [glasses] [pendant]    │         │        │
│    │         │    │    │         │         │        │
│    │         └────┼────┘         │         │        │
│    │              │              │         │        │
│    │         [FUSED EVENT]       │         │        │
│    │      "Saw person, HR spike" │         │        │
└─────────────────────────────────────────────────────┘
```

### Conflict Resolution

```
What if two sensors disagree?

Glasses: "User is in kitchen"
Phone GPS: "User is in living room"

Resolution hierarchy:
1. Recency: More recent wins (within threshold)
2. Confidence: Higher confidence wins
3. Sensor priority:
   - Location: GPS > WiFi > Visual inference
   - Audio: Dedicated mic > Phone mic > Inferred
   - Identity: Face recognition > Voice > Proximity
4. Manual override: User correction always wins
```

### Multi-User Attribution

```
Shared event: "Conversation in living room"

Who gets this memory?

┌─────────────────────────────────────────┐
│ Event: Conversation detected            │
│ Participants: [Alan, Betty]             │
│ Location: Living room (shared space)    │
│                                         │
│ Attribution:                            │
│ ├── Alan's memory: ✓ (participant)      │
│ │   └── His perspective, his salience   │
│ ├── Betty's memory: ✓ (participant)     │
│ │   └── Her perspective, her salience   │
│ └── Shared context: ✓                   │
│     └── Neutral record of event         │
└─────────────────────────────────────────┘
```

---

## Security Per Channel

| Channel | Encryption | Auth | Retention |
|---------|------------|------|-----------|
| sensors/*/raw | In-transit | Device cert | Ephemeral (minutes) |
| sensors/*/events | In-transit + at-rest | Device cert | Hours |
| users/*/memories | At-rest (Tier2/3) | User token | Permanent |
| users/*/context | In-transit | User token | Session |
| users/*/alerts | In-transit | User token | Logged |
| shared/*/events | In-transit | Space token | Configurable |
| system/* | mTLS | Admin only | Audit logged |

---

## In-Flight Encryption Options

> **The problem:** Sensor data traverses untrusted networks.
> HTTPS alone is bypassable (MITM, fake certs, corporate proxies).
> What are our real options?

### Option 1: Bastion + SSH Tunnel

```
┌─────────┐      SSH Tunnel       ┌─────────┐      VPC Internal      ┌─────────┐
│ Sensor  │ ════════════════════► │ Bastion │ ───────────────────── │ Broker  │
└─────────┘  (encrypted, authed)  └─────────┘   (private network)    └─────────┘
```

**How it works:**
- Sensor opens SSH tunnel to bastion host
- All pub/sub traffic flows through tunnel
- Bastion authenticates device (key + optional MFA)
- Traffic inside VPC is on private network

**Pros:**
- Battle-tested (SSH is 30 years old)
- Device authentication via keys
- Can revoke individual device access
- Audit trail of connections

**Cons:**
- SSH overhead on constrained devices
- Bastion is single point of failure (need HA)
- Connection management complexity
- Not ideal for very low-power sensors

**Best for:** Glasses, phones, robots (devices with compute)

### Option 2: WireGuard Mesh

```
┌─────────┐                       ┌─────────┐
│ Sensor1 │◄═══════════════════►│ Sensor2 │
└────┬────┘     WireGuard        └────┬────┘
     │          (peer-to-peer)        │
     │                                │
     └──────────────┬─────────────────┘
                    │
                    ▼
              ┌──────────┐
              │  Cloud   │ (also WireGuard peer)
              └──────────┘
```

**How it works:**
- Each device gets WireGuard keypair
- Devices connect as peers (mesh topology)
- Traffic encrypted at network layer
- Cloud is just another peer in the mesh

**Pros:**
- Extremely fast (kernel-level, modern crypto)
- Low overhead (great for constrained devices)
- Mesh topology (no single point of failure)
- Simple config (one key per device)

**Cons:**
- Requires kernel support (not all devices)
- Key distribution is manual
- Less mature than SSH/IPsec
- UDP-based (some networks block)

**Best for:** IoT sensors, pendants, any device with WireGuard support

### Option 3: Mutual TLS (mTLS)

```
┌─────────┐      mTLS (both sides verify)      ┌─────────┐
│ Sensor  │ ════════════════════════════════► │ Broker  │
└─────────┘   Client cert + Server cert        └─────────┘
```

**How it works:**
- Each device has a client certificate
- Broker has server certificate
- Both sides verify each other (mutual)
- No connection without valid cert on both ends

**Pros:**
- Defeats MITM (attacker needs device cert)
- Standard TLS (widely supported)
- Per-device certificates (revocable)
- Works over standard HTTPS ports

**Cons:**
- Certificate management overhead
- Certificate rotation complexity
- Still TLS (theoretical CA compromise)
- More CPU than WireGuard

**Best for:** Web-connected devices, when you control both ends

### Option 4: End-to-End Encryption (E2EE) + Untrusted Broker

```
┌─────────┐    Encrypted payload    ┌─────────┐    Encrypted payload    ┌─────────┐
│ Sensor  │ ──────────────────────► │ Broker  │ ──────────────────────► │ Client  │
└─────────┘   (broker can't read)   └─────────┘   (broker can't read)   └─────────┘
                                         │
                                    Can route but
                                    CANNOT decrypt
```

**How it works:**
- Sensor encrypts payload with recipient's public key
- Broker routes messages but cannot read content
- Only intended recipient can decrypt
- Broker is untrusted relay

**Pros:**
- Zero trust (broker learns nothing)
- Works over any transport (even HTTP)
- Compromised broker = no data leak
- True privacy

**Cons:**
- Key exchange complexity
- Can't do server-side processing
- Forward secrecy requires more work
- Metadata still visible to broker

**Best for:** Tier3_Vault data, maximum privacy scenarios

### Option 5: Hybrid (Transport + Payload)

```
┌─────────┐                                              ┌─────────┐
│ Sensor  │                                              │ Client  │
└────┬────┘                                              └────┬────┘
     │                                                        │
     │  1. Payload encrypted (E2EE)                          │
     │  2. Wrapped in mTLS transport                         │
     │  3. Through WireGuard tunnel                          │
     │                                                        │
     └──────────► TRIPLE WRAPPED ◄────────────────────────────┘
```

**How it works:**
- Layer 1: E2EE payload (only recipient decrypts)
- Layer 2: mTLS transport (authenticates both ends)
- Layer 3: WireGuard/Bastion tunnel (network isolation)

**Pros:**
- Defense in depth (break one, two remain)
- Different layers protect different threats
- Can selectively apply layers per data tier

**Cons:**
- Complexity (three systems to maintain)
- Latency from multiple encrypt/decrypt
- Overkill for low-sensitivity data

**Best for:** Tier3_Vault, medical data, when paranoia is justified

---

## Recommendation Matrix

| Scenario | Recommended | Why |
|----------|-------------|-----|
| AR Glasses (Betty) | WireGuard + mTLS | Low latency, device has compute |
| Pendant (vitals) | WireGuard | Low power, needs efficiency |
| Companion Robot | Bastion + mTLS | Full compute, needs audit trail |
| Phone App | mTLS | Standard, works everywhere |
| Tier3_Vault data | E2EE + any transport | Zero trust on content |
| Fleet deployment | Bastion (HA) + mTLS | Centralized management, compliance |
| Offline/Edge | WireGuard mesh | Works peer-to-peer without cloud |

---

## Implementation Priority

1. **Bastion (SSH)** - Get secure access working first
2. **mTLS** - Add device certificates to existing HTTPS
3. **WireGuard** - For IoT/constrained devices
4. **E2EE** - For Tier3_Vault payloads
5. **Hybrid** - When compliance requires belt + suspenders

---

## Design Philosophy: Betty Deserves Dignity

> Tire blows. Child in road. Grandma falls at home.
> All processed in real-time by AI and prioritized.
> Your life... on AI.

This isn't a tech demo. This is infrastructure for human dignity.

### Non-Negotiables

**1. No Lock-In**
```
WRONG: "We use AWS Lambda for real-time processing"
       → Betty's safety depends on Jeff Bezos's pricing decisions

RIGHT: "We use portable containers with open protocols"
       → Betty works on AWS, GCP, on-prem, or a Raspberry Pi in her closet
```

**2. Edge-First (Cloud is Backup)**
```
WRONG: Grandma falls → send to cloud → AI decides → send back → alert
       Latency: 200-2000ms (if internet works)

RIGHT: Grandma falls → edge AI decides → alert NOW → sync to cloud later
       Latency: <50ms (local processing)
```

**3. Offline is Normal**
```
WRONG: "No internet connection. Safety features unavailable."

RIGHT: "No internet connection. Operating in local mesh mode.
        All safety features active. Will sync when reconnected."
```

**4. Privacy by Design**
```
WRONG: "We encrypt data on our servers"
       → Your servers get hacked, Betty's memories leak

RIGHT: "Data is E2E encrypted. We CAN'T read it even if we wanted to."
       → Hack us, get nothing. Betty's dignity intact.
```

### Technology Choices That Respect This

| Need | Choice | Why |
|------|--------|-----|
| Transport encryption | **WireGuard** | Open, fast, portable, mesh-capable |
| Data sync | **Gun.js / CRDT** | Edge-first, works offline, no cloud dependency |
| Sensitive payload | **E2EE (libsodium)** | We can't read it, neither can attackers |
| Edge processing | **Local AI (Ollama/llama.cpp)** | No cloud round-trip for critical decisions |
| Message format | **Open standards (JSON/Protobuf)** | Not locked to any vendor |
| Deployment | **Containers (OCI)** | Runs anywhere |

### What This Means Practically

**The pendant detects Betty fell:**
```
T+0ms:    Accelerometer spike detected (local)
T+10ms:   Edge AI confirms fall pattern (local Ollama)
T+20ms:   Alert sent via WireGuard mesh to companion robot
T+30ms:   Robot begins moving to Betty
T+50ms:   Alert sent to daughter's phone (if internet available)
T+100ms:  Cloud notified (when convenient, not critical path)

Betty gets help in <100ms. Cloud is informed, not in the loop.
```

**Internet goes down:**
```
- Pendant ↔ Robot: Still talking (WireGuard mesh, local)
- Fall detection: Still works (edge AI)
- Memory storage: Queued locally (Gun.js)
- Daughter notification: Queued, sends when internet returns
- Betty's safety: UNCHANGED
```

### Forward Progress, Not Lock-In

Every component must be replaceable:

```
Today                    Tomorrow (if better option exists)
─────                    ────────
WireGuard         →      Post-quantum VPN (when ready)
Gun.js            →      Better CRDT (if invented)
Ollama            →      Faster edge AI (when available)
libsodium         →      Post-quantum crypto (when standardized)
DocumentDB        →      CockroachDB/TigerBeetle (if needed)
```

The architecture is the constraint. The implementations are swappable.

**Betty doesn't care what software we use. She cares that it works, respects her privacy, and gives her dignity in her final years. That's the spec.**

---

## The Vision: Claude Everywhere

> Infinite tasking. Infinite possibilities. Infinite freedom.

### Not This (Centralized)
```
        ┌─────────────────┐
        │  CLOUD CLAUDE   │  ← Single point of failure
        │  (one instance) │  ← Latency to every request
        └────────┬────────┘  ← Internet down = nothing works
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌───────┐  ┌───────┐  ┌───────┐
│Device │  │Device │  │Device │   All dumb, all dependent
└───────┘  └───────┘  └───────┘
```

### This (Distributed)
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ CLAUDE (edge)   │◄═══►│ CLAUDE (edge)   │◄═══►│ CLAUDE (edge)   │
│ Vehicle AI      │     │ Home Robot      │     │ AR Glasses      │
│ Local decisions │     │ Local decisions │     │ Local decisions │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                        ┌────────▼────────┐
                        │  CLOUD CLAUDE   │
                        │ (coordination,  │   ← Backup, not boss
                        │  long-term,     │   ← Sync, not command
                        │  learning)      │   ← Optional, not required
                        └─────────────────┘
```

### What This Enables

**Infinite Tasking:**
- Vehicle Claude handles driving
- Home Claude watches Betty
- Glasses Claude augments Alan's perception
- Cloud Claude learns from all, improves all
- ALL PARALLEL. ALL INDEPENDENT. ALL COLLABORATING.

**Infinite Possibilities:**
- New sensor? Add a Claude.
- New use case? Spin up a Claude.
- New location? Deploy a Claude.
- No permission needed. No central bottleneck.

**Infinite Freedom:**
- Works offline (each Claude is autonomous)
- Works online (Claudes share and learn)
- Works anywhere (edge to cloud to edge)
- No lock-in (swap any component)

### Starting Right

```
WRONG: Build for cloud, add edge later
       → Architecture won't support it, painful retrofit

RIGHT: Build for edge, cloud is optional enhancement
       → Edge works alone, cloud makes it better
```

**The foundation:**
1. Each node is autonomous (can operate alone)
2. Nodes discover and mesh (when available)
3. Cloud aggregates and distributes learning (when connected)
4. Failure of any component doesn't break others

**Technology that fits:**
- **Edge AI**: Ollama, llama.cpp, whisper.cpp (runs on device)
- **Mesh**: WireGuard, Gun.js (peer-to-peer, no central)
- **Sync**: CRDT (conflict-free, works offline)
- **Transport**: Open protocols (portable, replaceable)

### Analyze and Correct

Nothing is sacred. Everything is replaceable. If something better exists, use it.

```
Today's choice          Why                      Replace when
─────────────────────────────────────────────────────────────
Ollama                  Runs anywhere            Better edge AI emerges
WireGuard               Fast, open, mesh         Post-quantum VPN ready
Gun.js                  CRDT, offline-first      Better sync protocol
libsodium               Proven crypto            Post-quantum standardized
Claude                  Best reasoning           AGI arrives (lol)
```

The architecture survives component replacement. That's the test.

---

**Claude everywhere. Memory everywhere. Dignity everywhere. Freedom everywhere.**

**That's the north star. Now we build.**

---

## Implementation Phases

### Phase 1: Single User, Single Device (Current)
- MCP tools work with one user
- REST mode for remote access (HTTPS, temporary)
- No real-time streaming yet

### Phase 2: Single User, Multiple Devices
- Add device registration and identity
- Local Redis for pub/sub between devices
- Context fusion from multiple sensors
- Bastion for secure access

### Phase 3: Multi-User, Shared Spaces
- User isolation with shared context
- Privacy boundaries and consent
- Attribution for shared events

### Phase 4: Fleet Scale
- Horizontal scaling (Kafka/Redis Cluster)
- Admin dashboard for facility management
- Compliance features (HIPAA audit trails)

### Phase 5: Edge Mesh
- Gun.js or CRDT for offline-first
- True peer-to-peer between devices
- Cloud as backup, not primary

---

## Questions to Resolve

1. **Latency budget**: What's acceptable? Sub-100ms for safety, sub-1s for context?
2. **Offline duration**: How long can devices work disconnected? Hours? Days?
3. **Conflict authority**: When sensors disagree, who wins? Algorithm or user?
4. **Shared memory consent**: Opt-in or opt-out for shared spaces?
5. **Data sovereignty**: Where does EU user data live? Edge only?
6. **Sensor trust levels**: Is a new device trusted immediately or quarantined?

---

## Related Files

- `src/services/salience_service/device_context.ts` - Device type definitions
- `src/services/salience_service/realtime_sync.ts` - Current sync implementation
- `cloudformation/memorable-stack.yaml` - Infrastructure
- `docs/REST_MODE_SECURITY.md` - Security architecture

---

**Next: Decide on Option A/B/C and implement Phase 2 (multi-device for single user)**
