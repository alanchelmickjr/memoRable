# Robot Fleet Deployment Guide

**Status:** READY FOR DEPLOYMENT
**Date:** 2026-01-13
**Branch:** `claude/prepare-robot-deployment-sOIMx`

---

## Overview

MemoRable provides context-aware memory for robot fleets, enabling Vision-Language-Action (VLA) models with persistent memory and real-time context awareness. This guide covers integration with Pudu robots, Utilitron android-bot, and ROS-based systems.

## Sensor Data Integration

### Android-Bot Reference Implementation

For base sensor data, integrate with the Utilitron Robotics android-bot project:

**Repository:** [github.com/Utilitron-Robotics/android-bot](https://github.com/Utilitron-Robotics/android-bot)

The android-bot provides:
- Lidar point cloud streaming
- Ultrasound proximity data
- Camera frame capture
- IMU/odometry fusion
- ROS bridge compatibility

MemoRable subscribes to this sensor data for context-aware memory formation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CENTRAL CLOUD (AWS)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ MCP Server  │  │  MongoDB    │  │   Redis     │          │
│  │ (23 tools)  │  │ (memories)  │  │ (context)   │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         └────────────────┴─────────────────┘                 │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │ WebSocket/HTTP
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴─────┐
    │ PUDU #1   │    │ PUDU #2   │    │ PUDU #N   │
    │ ┌───────┐ │    │ ┌───────┐ │    │ ┌───────┐ │
    │ │Lidar  │ │    │ │Lidar  │ │    │ │Lidar  │ │
    │ │Ultra- │ │    │ │Ultra- │ │    │ │Ultra- │ │
    │ │sound  │ │    │ │sound  │ │    │ │sound  │ │
    │ │Camera │ │    │ │Camera │ │    │ │Camera │ │
    │ └───────┘ │    │ └───────┘ │    │ └───────┘ │
    │     ↓     │    │     ↓     │    │     ↓     │
    │ android-  │    │ android-  │    │ android-  │
    │ bot base  │    │ bot base  │    │ bot base  │
    │     ↓     │    │     ↓     │    │     ↓     │
    │ VLA Model │    │ VLA Model │    │ VLA Model │
    │ (RL)      │    │ (RL)      │    │ (RL)      │
    └───────────┘    └───────────┘    └───────────┘
```

---

## Robot Device Capabilities

When a robot registers with MemoRable, it automatically receives these capabilities:

```javascript
const robotCapabilities = {
  // Location & Navigation
  hasLocation: true,        // GPS/SLAM positioning
  hasOdometry: true,        // Wheel encoder tracking

  // Perception Sensors
  hasCamera: true,          // RGB camera for VLA vision
  hasLidar: true,           // 2D/3D range sensing
  hasUltrasound: true,      // Proximity detection
  hasDepthCamera: true,     // 3D depth perception
  hasIMU: true,             // Inertial measurement

  // AI/ML Capabilities
  hasVLA: true,             // Vision-Language-Action model
  hasMotorControl: true,    // Physical action execution

  // Operational
  hasMicrophone: true,      // Voice commands
  hasAmbient: true,         // Environmental sensing
  isAlwaysOn: true,         // Continuous operation
}
```

---

## Device Type Detection

MemoRable auto-detects robot devices via:

**Source parameter:**
```javascript
// Any of these values → deviceType: 'robot'
source: 'robot'      // Generic robot
source: 'pudu'       // Pudu Robotics
source: 'utilitron'  // Utilitron android-bot
source: 'ros'        // ROS-based systems
```

**User-Agent string:**
```javascript
// Matches in user-agent → deviceType: 'robot'
'robot'
'pudu'
'utilitron'
'ros'
'android-bot'
```

---

## Context Timing

Robot context has a **30-second TTL** for real-time VLA requirements:

| Device Type | Context TTL | Rationale |
|-------------|-------------|-----------|
| Robot | 30 seconds | Real-time VLA decision making |
| AR Glasses | 1 minute | Real-time visual overlay |
| Wearable | 2 minutes | Constant heartbeat |
| Mobile | 5 minutes | Frequent updates |
| Desktop | 15 minutes | Less frequent |

---

## Navigation Memory Types

MemoRable now includes comprehensive spatial memory types for robot navigation. These are defined in `src/services/ingestion_service/models.ts`.

### Robot Pose

Track robot position and orientation with sensor fusion:

```typescript
interface RobotPose {
  position: { x: number; y: number; z?: number };  // meters
  orientation: { roll: number; pitch: number; yaw: number };  // radians
  velocity?: {
    linear: { x: number; y: number; z?: number };   // m/s
    angular: { x: number; y: number; z: number };   // rad/s
  };
  confidence: number;  // 0-1
  source: 'odometry' | 'slam' | 'gps' | 'visual' | 'fusion';
  frameId?: string;    // "map", "odom", "base_link"
}
```

### Waypoints

Named locations for navigation with semantic context:

```typescript
interface Waypoint {
  waypointId: string;
  name: string;                    // "Kitchen", "Charging Station A"
  pose: RobotPose;
  placeType?: WaypointType;        // 'room', 'corridor', 'charging_station', etc.
  floor?: number;
  zone?: string;
  isChargingStation?: boolean;
  isDeliveryPoint?: boolean;
  isRestricted?: boolean;
  operatingHours?: { start: string; end: string };
}
```

### Navigation Paths

Track routes between waypoints:

```typescript
interface NavigationPath {
  pathId: string;
  startWaypoint: Waypoint;
  endWaypoint: Waypoint;
  viaWaypoints?: Waypoint[];
  pathPoints?: Array<{ x: number; y: number; heading?: number }>;
  totalDistance?: number;          // meters
  estimatedDuration?: number;      // ms
  status: 'planned' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress?: number;               // 0-1
}
```

### Obstacle Detection

Safety-critical obstacle tracking:

```typescript
interface ObstacleContext {
  obstacleId: string;
  position: { x: number; y: number; z?: number };
  obstacleType: 'person' | 'robot' | 'furniture' | 'wall' | 'door' | ...;
  isDynamic: boolean;
  velocity?: { x: number; y: number };
  safetyMargin: number;            // meters
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  detectedBy: 'lidar' | 'ultrasound' | 'camera' | 'depth_camera' | 'fusion';
}
```

### Navigation Tasks

Track navigation goals (like OpenLoop but for spatial objectives):

```typescript
interface NavigationTask {
  taskId: string;
  robotId: string;
  goalType: 'goto' | 'patrol' | 'follow' | 'return_home' | 'charge' | 'deliver';
  destination: Waypoint;
  waypoints?: Waypoint[];          // Multi-stop tasks
  status: NavigationStatus;
  progress: number;                // 0-1
  priority: 'low' | 'normal' | 'high' | 'urgent';
  purpose?: string;                // "Deliver coffee to room 204"
  deadline?: string;               // Must arrive by this time
  blockedBy?: ObstacleContext;     // What's stopping us
}
```

### Map References

Link memories to specific maps/floors:

```typescript
interface MapReference {
  mapId: string;
  mapName: string;
  mapType: 'occupancy_grid' | 'semantic' | 'topological' | 'floor_plan' | 'point_cloud';
  version: string;
  resolution?: number;             // meters per cell
  buildingId?: string;
  floor?: number;
}
```

---

## API Integration

### Sensor Data Ingestion

Push sensor data from android-bot to MemoRable:

```bash
POST http://memorable_ingestion_service:8001/api/ingest
Content-Type: application/json

{
  "sourceSystem": "ROBOT_SENSOR",
  "agentId": "pudu_robot_001",
  "deviceId": "dev_abc123",
  "deviceType": "robot",
  "contentType": "SENSOR_DATA",
  "contentRaw": {
    "lidar": {
      "points": [...],
      "timestamp": "2026-01-13T10:00:00.000Z"
    },
    "ultrasound": {
      "ranges": [1.2, 0.8, 2.1, 1.5],
      "timestamp": "2026-01-13T10:00:00.000Z"
    },
    "camera": {
      "frame_id": "frame_12345",
      "base64": "..."
    },
    "imu": {
      "acceleration": [0.1, -0.2, 9.8],
      "gyroscope": [0.01, 0.02, 0.0],
      "orientation": [0.0, 0.0, 0.707, 0.707]
    },
    "odometry": {
      "position": [10.5, 3.2, 0.0],
      "velocity": [0.5, 0.0, 0.1]
    }
  },
  "eventTimestamp": "2026-01-13T10:00:00.000Z"
}
```

### Navigation Event Ingestion

Log waypoint arrivals, navigation starts, and obstacles:

```bash
# Waypoint reached
POST http://memorable_ingestion_service:8001/api/ingest
Content-Type: application/json

{
  "sourceSystem": "ROBOT_NAV",
  "agentId": "pudu_robot_001",
  "deviceType": "robot",
  "contentType": "NavigationEvent",
  "contentRaw": {
    "eventType": "waypoint_reached",
    "waypoint": {
      "waypointId": "wp_kitchen_001",
      "name": "Kitchen",
      "placeType": "room",
      "floor": 1
    },
    "pose": {
      "position": { "x": 15.2, "y": 8.7, "z": 0.0 },
      "orientation": { "roll": 0, "pitch": 0, "yaw": 1.57 },
      "confidence": 0.95,
      "source": "slam"
    }
  },
  "spatialContext": {
    "locationName": "Kitchen",
    "robotPose": { ... },
    "currentWaypoint": { ... }
  }
}
```

```bash
# Obstacle detected
POST http://memorable_ingestion_service:8001/api/ingest
Content-Type: application/json

{
  "sourceSystem": "ROBOT_SAFETY",
  "agentId": "pudu_robot_001",
  "deviceType": "robot",
  "contentType": "ObstacleDetection",
  "contentRaw": {
    "obstacleId": "obs_person_042",
    "position": { "x": 2.1, "y": 0.3 },
    "obstacleType": "person",
    "isDynamic": true,
    "velocity": { "x": 0.5, "y": 0.1 },
    "threatLevel": "medium",
    "detectedBy": "lidar",
    "confidence": 0.87
  }
}
```

### Context Retrieval for VLA

Pull context for VLA model decisions:

```bash
POST http://memorable_retrieval_service:3004/retrieve
Content-Type: application/json

{
  "userId": "pudu_robot_001",
  "query": "current task context",
  "deviceType": "robot",
  "limit": 10
}
```

### MCP Tools for Robots

The MCP server provides 23 tools. Key ones for robots:

| Tool | Purpose |
|------|---------|
| `store_memory` | Save observations with auto-salience |
| `recall` | Retrieve relevant memories for decisions |
| `set_context` | Update current operational context |
| `whats_relevant` | Get ATR (At-The-Right-moment) context |
| `anticipate` | Predictive patterns (21-day learning) |
| `get_timeline` | Scheduled events/deadlines |

---

## VLA Reinforcement Learning Integration

### Context Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Sensor Data │ ──▶ │  MemoRable  │ ──▶ │  VLA Model  │
│ (android-   │     │  Ingestion  │     │     (RL)    │
│  bot)       │     │             │     │             │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                          │                    │
                          ▼                    ▼
                   ┌─────────────┐     ┌─────────────┐
                   │  Salience   │     │   Action    │
                   │  Scoring    │     │  Execution  │
                   └──────┬──────┘     └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │  Pattern    │
                   │  Learning   │
                   │ (21-day)    │
                   └─────────────┘
```

### Sample VLA Loop

```python
# Pseudocode for VLA integration
while robot.is_running():
    # 1. Get sensor data from android-bot
    sensors = android_bot.get_sensor_frame()

    # 2. Push to MemoRable for context enrichment
    memorable.ingest(sensors, device_type='robot')

    # 3. Get relevant context for decision
    context = memorable.recall(
        query="current task",
        device_type="robot"
    )

    # 4. VLA model makes decision
    action = vla_model.decide(
        vision=sensors.camera,
        language=context.task_description,
        history=context.memories
    )

    # 5. Execute action
    robot.execute(action)

    # 6. Store outcome for learning
    memorable.store_memory(
        content=f"Executed {action.type}",
        outcome=action.result,
        device_type="robot"
    )
```

---

## Security Tiers

| Tier | Robot Use Case | Example |
|------|----------------|---------|
| **Tier 1 (General)** | Operational logs, navigation | "Moved to waypoint A" |
| **Tier 2 (Personal)** | User interactions | "Served coffee to Bob" |
| **Tier 3 (Vault)** | Never on robots | N/A |

Robots default to Tier 2 for user interactions. Tier 3 (Vault) data never leaves the central cloud.

---

## Deployment

### CloudFormation (AWS)

```bash
aws cloudformation create-stack \
  --stack-name memorable-robot-fleet \
  --template-body file://cloudformation/memorable-stack.yaml \
  --parameters \
    ParameterKey=InstanceSize,ParameterValue=medium \
    ParameterKey=LLMProvider,ParameterValue=bedrock \
  --capabilities CAPABILITY_NAMED_IAM
```

### Docker (Local/Edge)

```bash
# Central services
docker-compose up -d \
  memorable_app \
  memorable_mcp_server \
  memorable_ingestion_service \
  memorable_mongo \
  memorable_redis

# Verify health
curl http://localhost:3000/health
curl http://localhost:8001/api/ingest/health
```

### Robot Environment Variables

```bash
# Per-robot configuration
MCP_USER_ID=pudu_robot_001
DEVICE_TYPE=robot
ROBOT_FLEET_ID=office_fleet_alpha
MEMORABLE_CLOUD_URL=https://memorable.example.com
OAUTH_CLIENT_ID=robot_001_client
OAUTH_CLIENT_SECRET=<generated>
```

---

## Monitoring

| Service | URL | Purpose |
|---------|-----|---------|
| Prometheus | http://localhost:9090 | Metrics collection |
| Grafana | http://localhost:3001 | Dashboards |
| Health | http://localhost:3000/health | App health |
| Ingestion | http://localhost:8001/api/ingest/health | Ingest health |

---

## Checklist

### Before Office Deployment

- [ ] Central cloud deployed (CloudFormation/Terraform)
- [ ] MongoDB/Redis endpoints configured
- [ ] OAuth credentials generated per robot
- [ ] android-bot sensor bridge configured
- [ ] VLA model integrated with recall API
- [ ] Health endpoints responding
- [ ] Monitoring dashboards configured

### Per-Robot Setup

- [ ] `MCP_USER_ID` set to unique robot ID
- [ ] `DEVICE_TYPE=robot` in environment
- [ ] OAuth token flow tested
- [ ] Sensor ingestion verified
- [ ] Context retrieval latency < 100ms

---

## References

- **android-bot:** [github.com/Utilitron-Robotics/android-bot](https://github.com/Utilitron-Robotics/android-bot)
- **MemoRable MCP Tools:** See `src/services/mcp_server/index.ts`
- **Device Context:** See `src/services/salience_service/device_context.js`
- **CloudFormation:** See `cloudformation/memorable-stack.yaml`
- **Security Tiers:** See `docs/LAUNCH_READINESS.md`
