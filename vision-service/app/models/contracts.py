from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class Box(ApiModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)


class Detection(ApiModel):
    label: str
    confidence: float = Field(ge=0, le=1)
    box: Box
    target: bool


class VisionOutcome(ApiModel):
    turn_id: str = Field(alias="turnId")
    elapsed_ms: int = Field(alias="elapsedMs", ge=0)
    points: int = Field(ge=0)
    xp: int = Field(ge=0)
    total_score: int = Field(alias="totalScore", ge=0)
    total_xp: int = Field(alias="totalXp", ge=0)
    level: int = Field(ge=1, le=50)
    streak: int = Field(ge=0)
    unlocked_achievement_ids: list[str] = Field(alias="unlockedAchievementIds")


class VisionVerdict(ApiModel):
    decision: Literal["continue", "pass", "system_error"]
    progress: float = Field(ge=0, le=1)
    detections: list[Detection]
    note: str | None = None
    outcome: VisionOutcome | None = None


class CalibrationResponse(ApiModel):
    calibration_token: str = Field(alias="calibrationToken")
    background_classes: list[str] = Field(alias="backgroundClasses")


class HealthResponse(ApiModel):
    status: Literal["ok"] = "ok"
    model_version: str = Field(alias="modelVersion")
