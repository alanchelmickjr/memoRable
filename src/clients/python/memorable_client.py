# CLOUD ONLY — No local dev, no local Docker, no localhost. All infra runs in AWS. No exceptions.
"""MemoRable MCP Client — Python wrapper for MemoRable StreamableHTTP MCP.

Pure MCP. No REST. The memory IS the identity.

Usage:
    from memorable_client import get_memorable_client

    memory = get_memorable_client()
    await memory.connect()

    # On startup — "where was I?"
    context = await memory.whats_relevant()

    # Meeting someone — get briefing
    briefing = await memory.get_briefing("Alan")

    # Store interaction
    await memory.store("Great conversation about robot hiking with Alan")

    # Recall
    memories = await memory.recall("hiking plans")

    await memory.close()
"""

import asyncio
import aiohttp
import json
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from datetime import datetime


MCP_URL = os.environ.get("MEMORABLE_MCP_URL", "http://52.9.62.72:8080/mcp")
MCP_PROTOCOL_VERSION = "2025-03-26"


@dataclass
class Memory:
    """A single memory with salience scoring."""
    id: str
    content: str
    salience: float
    timestamp: datetime
    entity: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Memory":
        ts = data.get("timestamp", data.get("createdAt", datetime.now().isoformat()))
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return cls(
            id=data.get("_id", data.get("id", data.get("memoryId", ""))),
            content=data.get("content", data.get("text", "")),
            salience=data.get("salience", data.get("salience_score", data.get("salienceScore", 50))),
            timestamp=ts,
            entity=data.get("entity"),
            context=data.get("context", {}),
        )


@dataclass
class Briefing:
    """Pre-conversation briefing about a person."""
    person: str
    last_interaction: Optional[datetime]
    you_owe_them: List[str]
    they_owe_you: List[str]
    recent_topics: List[str]
    sensitivities: List[str]
    upcoming_events: List[str]

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Briefing":
        li = data.get("last_interaction") or data.get("lastInteraction")
        return cls(
            person=data.get("person", ""),
            last_interaction=datetime.fromisoformat(li.replace("Z", "+00:00")) if li else None,
            you_owe_them=data.get("you_owe_them", data.get("youOweThem", [])),
            they_owe_you=data.get("they_owe_you", data.get("theyOweYou", [])),
            recent_topics=data.get("recent_topics", data.get("recentTopics", [])),
            sensitivities=data.get("sensitivities", []),
            upcoming_events=data.get("upcoming_events", data.get("upcomingEvents", [])),
        )


class MemoRableClient:
    """MCP StreamableHTTP client for MemoRable.

    Speaks JSON-RPC 2.0 over HTTP with SSE responses.
    No REST. No localhost. Cloud only.
    """

    def __init__(
        self,
        mcp_url: str = MCP_URL,
        entity: str = "chloe",
        device_id: str = "johnny5-main",
        device_type: str = "robot",
    ):
        self.mcp_url = mcp_url
        self.entity = entity
        self.device_id = device_id
        self.device_type = device_type
        self._session: Optional[aiohttp.ClientSession] = None
        self._mcp_session_id: Optional[str] = None
        self._request_id = 0
        self._initialized = False

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def _mcp_request(self, method: str, params: Optional[Dict] = None, is_notification: bool = False) -> Any:
        """Send a JSON-RPC 2.0 request to the MCP server via StreamableHTTP."""
        session = await self._get_session()

        payload: Dict[str, Any] = {
            "jsonrpc": "2.0",
            "method": method,
        }
        if not is_notification:
            payload["id"] = self._next_id()
        if params is not None:
            payload["params"] = params

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self._mcp_session_id:
            headers["Mcp-Session-Id"] = self._mcp_session_id

        async with session.post(self.mcp_url, json=payload, headers=headers) as resp:
            # Capture session ID from response headers
            sid = resp.headers.get("Mcp-Session-Id")
            if sid:
                self._mcp_session_id = sid

            # Notifications get 202/204 with no body
            if is_notification or resp.status == 202 or resp.status == 204:
                return None

            content_type = resp.content_type or ""

            if "text/event-stream" in content_type:
                # Parse SSE response
                body = await resp.text()
                for line in body.split("\n"):
                    if line.startswith("data: "):
                        data = json.loads(line[6:])
                        if "result" in data:
                            return data["result"]
                        if "error" in data:
                            raise Exception(f"MCP error: {data['error']}")
                return None
            else:
                data = await resp.json()
                if "result" in data:
                    return data["result"]
                if "error" in data:
                    raise Exception(f"MCP error: {data['error']}")
                return data

    async def _call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Call an MCP tool and return the result content."""
        if not self._initialized:
            await self.connect()

        result = await self._mcp_request("tools/call", {
            "name": tool_name,
            "arguments": arguments,
        })

        if result and isinstance(result, dict):
            content = result.get("content", [])
            if isinstance(content, list) and len(content) > 0:
                text = content[0].get("text", "")
                try:
                    return json.loads(text)
                except (json.JSONDecodeError, TypeError):
                    return text
        return result

    # =========================================================================
    # Connection
    # =========================================================================

    async def connect(self) -> bool:
        """Initialize MCP session."""
        try:
            result = await self._mcp_request("initialize", {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {
                    "name": f"memorable-{self.entity}",
                    "version": "1.0.0",
                },
            })
            self._initialized = True

            # Send initialized notification (no id — it's a notification)
            await self._mcp_request("notifications/initialized", is_notification=True)
            return True
        except Exception as e:
            print(f"MemoRable MCP init failed: {e}")
            return False

    async def close(self):
        """Close the session."""
        if self._session and not self._session.closed:
            await self._session.close()
        self._initialized = False
        self._mcp_session_id = None

    async def health_check(self) -> bool:
        """Check if MemoRable MCP is reachable."""
        try:
            session = await self._get_session()
            async with session.get(
                self.mcp_url.replace("/mcp", "/health"),
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                return resp.status == 200
        except Exception:
            return False

    # =========================================================================
    # Core Memory Operations
    # =========================================================================

    async def store(
        self,
        content: str,
        context: Optional[Dict[str, Any]] = None,
        security_tier: str = "Tier2_Personal",
    ) -> Optional[str]:
        """Store a memory via MCP store_memory tool."""
        args: Dict[str, Any] = {
            "text": content,
            "securityTier": security_tier,
        }
        if context:
            args["context"] = context

        result = await self._call_tool("store_memory", args)
        if isinstance(result, dict):
            return result.get("memoryId")
        return None

    async def recall(
        self,
        query: str,
        limit: int = 10,
        min_salience: float = 0,
    ) -> List[Memory]:
        """Search memories via MCP recall tool."""
        args: Dict[str, Any] = {
            "query": query,
            "limit": limit,
        }
        if min_salience > 0:
            args["minSalience"] = min_salience

        result = await self._call_tool("recall", args)
        if isinstance(result, list):
            return [Memory.from_dict(m) for m in result]
        if isinstance(result, dict) and "memories" in result:
            return [Memory.from_dict(m) for m in result["memories"]]
        return []

    async def forget(self, memory_id: str, mode: str = "archive") -> bool:
        """Forget a memory via MCP forget tool."""
        result = await self._call_tool("forget", {
            "memoryId": memory_id,
            "mode": mode,
        })
        return bool(result)

    # =========================================================================
    # Context Awareness
    # =========================================================================

    async def set_context(
        self,
        location: Optional[str] = None,
        people: Optional[List[str]] = None,
        activity: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Set current context via MCP set_context tool."""
        args: Dict[str, Any] = {
            "deviceId": self.device_id,
            "deviceType": self.device_type,
        }
        if location:
            args["location"] = location
        if people:
            args["people"] = people
        if activity:
            args["activity"] = activity

        result = await self._call_tool("set_context", args)
        return result if isinstance(result, dict) else {}

    async def whats_relevant(self) -> Dict[str, Any]:
        """Get what's relevant NOW via MCP whats_relevant tool."""
        result = await self._call_tool("whats_relevant", {"unified": True})
        return result if isinstance(result, dict) else {}

    async def clear_context(self) -> bool:
        """Clear context via MCP clear_context tool."""
        result = await self._call_tool("clear_context", {
            "deviceId": self.device_id,
        })
        return bool(result)

    # =========================================================================
    # People & Relationships
    # =========================================================================

    async def get_briefing(self, person: str, quick: bool = False) -> Optional[Briefing]:
        """Get pre-conversation briefing via MCP get_briefing tool."""
        result = await self._call_tool("get_briefing", {
            "person": person,
            "quick": quick,
        })
        if isinstance(result, dict) and result.get("person"):
            return Briefing.from_dict(result)
        return None

    async def get_relationship(self, entity_a: str, entity_b: str) -> Dict[str, Any]:
        """Synthesize relationship between two entities."""
        result = await self._call_tool("get_relationship", {
            "entity_a": entity_a,
            "entity_b": entity_b,
        })
        return result if isinstance(result, dict) else {}

    async def remember_person(
        self,
        name: str,
        notes: Optional[str] = None,
    ) -> Optional[str]:
        """Store memory about meeting a person."""
        content = f"Met {name}"
        if notes:
            content += f". {notes}"
        return await self.store(content, context={"person": name})

    # =========================================================================
    # Commitments
    # =========================================================================

    async def list_loops(self, person: Optional[str] = None) -> List[Dict]:
        """List open commitments via MCP list_loops tool."""
        args: Dict[str, Any] = {}
        if person:
            args["person"] = person
        result = await self._call_tool("list_loops", args)
        if isinstance(result, list):
            return result
        if isinstance(result, dict) and "loops" in result:
            return result["loops"]
        return []

    async def close_loop(self, loop_id: str, note: Optional[str] = None) -> bool:
        """Close a commitment."""
        args: Dict[str, Any] = {"loopId": loop_id}
        if note:
            args["note"] = note
        result = await self._call_tool("close_loop", args)
        return bool(result)

    # =========================================================================
    # Predictions & Anticipation
    # =========================================================================

    async def anticipate(self, look_ahead_minutes: int = 60) -> Dict[str, Any]:
        """Get predicted context and pre-surfaced memories."""
        result = await self._call_tool("anticipate", {
            "lookAheadMinutes": look_ahead_minutes,
        })
        return result if isinstance(result, dict) else {}

    async def get_predictions(self, topics: Optional[List[str]] = None) -> List[Dict]:
        """Get memories that should be surfaced NOW."""
        context: Dict[str, Any] = {
            "device_type": self.device_type,
            "activity_type": "social_interaction",
        }
        if topics:
            context["topics"] = topics

        result = await self._call_tool("get_predictions", {
            "context": context,
        })
        if isinstance(result, dict) and "predictions" in result:
            return result["predictions"]
        return []

    # =========================================================================
    # Device Handoff
    # =========================================================================

    async def handoff_to(self, target_device_id: str, target_type: str = "robot") -> Dict:
        """Hand off context to another device."""
        result = await self._call_tool("handoff_device", {
            "sourceDeviceId": self.device_id,
            "targetDeviceId": target_device_id,
            "targetDeviceType": target_type,
            "reason": "device_switch",
        })
        return result if isinstance(result, dict) else {}

    async def get_session_continuity(self) -> Dict[str, Any]:
        """Get cross-device session state."""
        result = await self._call_tool("get_session_continuity", {
            "deviceId": self.device_id,
            "deviceType": self.device_type,
        })
        return result if isinstance(result, dict) else {}

    # =========================================================================
    # Emotion
    # =========================================================================

    async def analyze_emotion(self, text: str) -> Dict[str, Any]:
        """Analyze emotional content of text."""
        result = await self._call_tool("analyze_emotion", {"text": text})
        return result if isinstance(result, dict) else {}

    # =========================================================================
    # Status
    # =========================================================================

    async def get_status(self) -> Dict[str, Any]:
        """Get system status."""
        result = await self._call_tool("get_status", {})
        return result if isinstance(result, dict) else {}


# =============================================================================
# Singleton
# =============================================================================

_client: Optional[MemoRableClient] = None


def get_memorable_client(
    mcp_url: str = MCP_URL,
    entity: str = "chloe",
    device_id: str = "johnny5-main",
    device_type: str = "robot",
) -> MemoRableClient:
    """Get the singleton MemoRable MCP client."""
    global _client
    if _client is None:
        _client = MemoRableClient(
            mcp_url=mcp_url,
            entity=entity,
            device_id=device_id,
            device_type=device_type,
        )
    return _client


# =============================================================================
# Convenience Functions for johnny5.py
# =============================================================================

async def on_startup(location: Optional[str] = None) -> Dict[str, Any]:
    """Called when robot starts — set context and get what's relevant."""
    client = get_memorable_client()

    if not await client.health_check():
        print("MemoRable not available — running without long-term memory")
        return {}

    await client.connect()

    # Set context — tell the cloud we're alive
    ctx = await client.set_context(
        location=location,
        activity="social_interaction",
    )

    # What's relevant now?
    relevant = await client.whats_relevant()

    print(f"MemoRable: Connected via MCP. Context set.")
    return relevant


async def on_person_recognized(name: str) -> Optional[Briefing]:
    """Called when face/voice identifies someone."""
    client = get_memorable_client()
    briefing = await client.get_briefing(name)

    if briefing:
        print(f"MemoRable: Briefing on {name}")
        if briefing.you_owe_them:
            print(f"  You owe them: {briefing.you_owe_them}")
    return briefing


async def on_conversation_end(
    person: Optional[str],
    summary: str,
) -> Optional[str]:
    """Called when conversation ends — store the interaction."""
    client = get_memorable_client()
    context = {}
    if person:
        context["person"] = person
    return await client.store(summary, context=context)


# =============================================================================
# Test
# =============================================================================

if __name__ == "__main__":
    async def test():
        print("Testing MemoRable MCP Client")
        print(f"Endpoint: {MCP_URL}")
        print("=" * 50)

        client = get_memorable_client()

        healthy = await client.health_check()
        print(f"Health: {'ok' if healthy else 'UNREACHABLE'}")

        if not healthy:
            print(f"Cannot reach {MCP_URL}")
            await client.close()
            return

        connected = await client.connect()
        print(f"MCP session: {'ok' if connected else 'FAILED'}")

        if not connected:
            await client.close()
            return

        # Set context
        print("\nSetting context...")
        ctx = await client.set_context(location="lab", activity="testing")
        print(f"  Context: {json.dumps(ctx, indent=2, default=str)[:200]}")

        # Store
        print("\nStoring test memory...")
        mid = await client.store("MCP client test from Chloe — hello cloud!")
        print(f"  Stored: {mid}")

        # Recall
        print("\nRecalling 'test'...")
        memories = await client.recall("test", limit=3)
        for m in memories:
            print(f"  [{m.salience:.0f}] {m.content[:60]}")

        # Status
        print("\nStatus...")
        status = await client.get_status()
        print(f"  {json.dumps(status, indent=2, default=str)[:200]}")

        await client.close()
        print("\nDone.")

    asyncio.run(test())
