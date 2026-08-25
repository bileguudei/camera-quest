from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Protocol


class VisionDisabled(Exception):
    pass


class ControlGateway(Protocol):
    async def vision_service_enabled(self) -> bool: ...


@dataclass(slots=True)
class VisionControlGate:
    gateway: ControlGateway
    ttl_seconds: float = 5.0
    _enabled: bool = True
    _refresh_at: float = 0.0
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def ensure_enabled(self) -> None:
        now = time.monotonic()
        if now >= self._refresh_at:
            async with self._lock:
                now = time.monotonic()
                if now >= self._refresh_at:
                    self._enabled = await self.gateway.vision_service_enabled()
                    self._refresh_at = now + self.ttl_seconds
        if not self._enabled:
            raise VisionDisabled
