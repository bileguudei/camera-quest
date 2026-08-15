from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.models.supabase_gateway import SupabaseGateway


@dataclass(frozen=True, slots=True)
class VisionAttemptTelemetry:
    turn_id: str
    sequence_no: int
    latency_ms: int
    confidence: float
    validator: str
    decision: str
    reason: str | None


class AttemptTelemetrySink(Protocol):
    async def submit(self, attempt: VisionAttemptTelemetry) -> None: ...


class InlineAttemptTelemetrySink:
    """Local fallback; Modal production injects its durable queued sink."""

    def __init__(self, gateway: SupabaseGateway) -> None:
        self._gateway = gateway

    async def submit(self, attempt: VisionAttemptTelemetry) -> None:
        await self._gateway.record_attempt(
            attempt.turn_id,
            attempt.sequence_no,
            attempt.latency_ms,
            attempt.confidence,
            attempt.validator,
            attempt.decision,
            attempt.reason,
        )
