from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class QuestConfig(BaseModel):
    id: str
    key: str
    kind: Literal["object", "fingers", "smile", "color"]
    target_class: str | None = None
    finger_count: int | None = Field(default=None, ge=1, le=5)
    target_color: Literal["red", "blue", "green", "yellow"] | None = None
    validator_config: dict[str, Any]


class ActiveTurn(BaseModel):
    id: str
    game_id: str
    player_id: str
    owner_id: str
    status: Literal["active"]
    started_at: datetime
    deadline_at: datetime
    quest: QuestConfig


class CalibrationClaims(BaseModel):
    sub: str
    exp: int
    background_classes: list[str] = Field(default_factory=list)
    color_ratios: dict[str, float] = Field(default_factory=dict)
    neutral_smile: float = 0
    hand_present: bool = False
