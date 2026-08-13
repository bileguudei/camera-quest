from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from app.models.contracts import Detection
from app.models.turn import CalibrationClaims, QuestConfig

Frame = np.ndarray[Any, np.dtype[np.uint8]]


@dataclass(frozen=True, slots=True)
class ValidationResult:
    passed: bool
    progress: float
    confidence: float
    detections: list[Detection] = field(default_factory=list)
    note: str | None = None
    reason: str | None = None


class Validator(ABC):
    kind: str
    version: str

    @abstractmethod
    async def validate(
        self,
        frames: list[Frame],
        quest: QuestConfig,
        calibration: CalibrationClaims,
    ) -> ValidationResult:
        """Return only recognition evidence; scoring is always a DB RPC concern."""
