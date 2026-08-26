from __future__ import annotations

import pytest

from app.security.abuse_guard import DistributedVisionGuard
from app.security.rate_limit import RateLimitExceeded
from app.security.vision_control import VisionControlGate, VisionDisabled


class BudgetGateway:
    def __init__(self, decisions: list[bool]) -> None:
        self.decisions = decisions
        self.claims: list[tuple[str, int, int]] = []

    async def claim_vision_budget(
        self, bucket_key: str, limit: int, window_seconds: int
    ) -> bool:
        self.claims.append((bucket_key, limit, window_seconds))
        return self.decisions.pop(0)


@pytest.mark.asyncio
async def test_distributed_guard_claims_subject_and_client_without_raw_identifiers() -> None:
    gateway = BudgetGateway([True, True, True])
    guard = DistributedVisionGuard(gateway, b"x" * 32)

    await guard.check("calibrate", "owner-secret", "203.0.113.4", "device-secret")

    assert [claim[1:] for claim in gateway.claims] == [(6, 60), (60, 60), (20, 60)]
    keys = " ".join(claim[0] for claim in gateway.claims)
    assert "owner-secret" not in keys
    assert "203.0.113.4" not in keys
    assert "device-secret" not in keys


@pytest.mark.asyncio
async def test_distributed_guard_rejects_when_either_cross_container_bucket_is_full() -> None:
    guard = DistributedVisionGuard(BudgetGateway([True, False, True]), b"x" * 32)
    with pytest.raises(RateLimitExceeded):
        await guard.check("warmup", "owner", "203.0.113.4", "device")


class ControlGateway:
    def __init__(self, enabled: bool) -> None:
        self.enabled = enabled
        self.calls = 0

    async def vision_service_enabled(self) -> bool:
        self.calls += 1
        return self.enabled


@pytest.mark.asyncio
async def test_remote_control_is_cached_briefly_and_blocks_when_disabled() -> None:
    gateway = ControlGateway(False)
    gate = VisionControlGate(gateway, ttl_seconds=5)

    with pytest.raises(VisionDisabled):
        await gate.ensure_enabled()
    with pytest.raises(VisionDisabled):
        await gate.ensure_enabled()

    assert gateway.calls == 1
