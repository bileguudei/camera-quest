from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Protocol

from app.security.rate_limit import RateLimitExceeded


class BudgetGateway(Protocol):
    async def claim_vision_budget(
        self,
        bucket_key: str,
        limit: int,
        window_seconds: int,
    ) -> bool: ...


_LIMITS: dict[str, tuple[int, int, int]] = {
    "warmup": (3, 40, 10),
    "calibrate": (6, 60, 20),
    "validate": (180, 3_000, 600),
    "stream": (12, 200, 40),
}


@dataclass(slots=True)
class DistributedVisionGuard:
    """Cross-container quotas without storing raw subjects, IPs, or devices."""

    gateway: BudgetGateway
    secret: bytes

    def _key(self, action: str, scope: str, value: str) -> str:
        digest = hmac.new(
            self.secret,
            f"{action}:{scope}:{value}".encode(),
            hashlib.sha256,
        ).hexdigest()
        return f"{action}:{scope}:{digest}"

    async def check(self, action: str, subject: str, ip: str, device: str) -> None:
        subject_limit, ip_limit, device_limit = _LIMITS[action]
        allowed_subject = await self.gateway.claim_vision_budget(
            self._key(action, "subject", subject), subject_limit, 60
        )
        allowed_ip = await self.gateway.claim_vision_budget(
            self._key(action, "ip", ip), ip_limit, 60
        )
        allowed_device = await self.gateway.claim_vision_budget(
            self._key(action, "device", device or "missing"), device_limit, 60
        )
        if not allowed_subject or not allowed_ip or not allowed_device:
            raise RateLimitExceeded
