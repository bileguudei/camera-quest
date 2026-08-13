from __future__ import annotations

from typing import Any

import httpx

from app.models.contracts import VisionOutcome
from app.models.turn import ActiveTurn, QuestConfig


class TurnUnavailable(Exception):
    pass


class SupabaseGateway:
    def __init__(self, url: str, service_role_key: str) -> None:
        self._client = httpx.AsyncClient(
            base_url=url.rstrip("/"),
            headers={
                # sb_secret keys belong only in apikey; the API gateway injects
                # the service role after validating the secret.
                "apikey": service_role_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=5,
        )

    async def get_active_turn(self, turn_id: str, owner_id: str) -> ActiveTurn:
        response = await self._client.get(
            "/rest/v1/turns",
            params={
                "id": f"eq.{turn_id}",
                "status": "eq.active",
                "select": (
                    "id,game_id,player_id,status,started_at,deadline_at,"
                    "quest:quests!inner(id,key,kind,target_class,finger_count,target_color,validator_config),"
                    "game:games!inner(owner_id)"
                ),
            },
        )
        response.raise_for_status()
        rows: list[dict[str, Any]] = response.json()
        if len(rows) != 1 or rows[0]["game"]["owner_id"] != owner_id:
            raise TurnUnavailable
        raw = rows[0]
        return ActiveTurn(
            id=raw["id"],
            game_id=raw["game_id"],
            player_id=raw["player_id"],
            owner_id=raw["game"]["owner_id"],
            status=raw["status"],
            started_at=raw["started_at"],
            deadline_at=raw["deadline_at"],
            quest=QuestConfig.model_validate(raw["quest"]),
        )

    async def resolve_turn(
        self,
        turn_id: str,
        sequence_no: int,
        latency_ms: int,
        confidence: float,
        validator: str,
        model_version: str,
        validator_version: str,
        reason: str | None,
    ) -> VisionOutcome:
        response = await self._rpc(
            "resolve_turn",
            {
                "p_turn_id": turn_id,
                "p_sequence_no": sequence_no,
                "p_latency_ms": latency_ms,
                "p_confidence": confidence,
                "p_validator": validator,
                "p_model_version": model_version,
                "p_validator_version": validator_version,
                "p_reason": reason,
            },
        )
        return VisionOutcome.model_validate(response)

    async def record_attempt(
        self,
        turn_id: str,
        sequence_no: int,
        latency_ms: int,
        confidence: float,
        validator: str,
        decision: str,
        reason: str | None,
    ) -> None:
        await self._rpc(
            "record_vision_attempt",
            {
                "p_turn_id": turn_id,
                "p_sequence_no": sequence_no,
                "p_latency_ms": latency_ms,
                "p_confidence": confidence,
                "p_validator": validator,
                "p_decision": decision,
                "p_reason": reason,
            },
        )

    async def abort_turn(self, turn_id: str, reason: str) -> None:
        await self._rpc("abort_turn", {"p_turn_id": turn_id, "p_reason": reason})

    async def _rpc(self, name: str, payload: dict[str, Any]) -> Any:
        response = await self._client.post(f"/rest/v1/rpc/{name}", json=payload)
        if response.status_code >= 400:
            raise TurnUnavailable(response.text[:200])
        return response.json() if response.content else None
