from __future__ import annotations

from typing import Protocol

from app.models.turn import CalibrationClaims, QuestConfig
from app.validators.base import Frame, ValidationResult, Validator


class FaceAnalyzer(Protocol):
    def smile_score(self, frame: Frame) -> float | None: ...


class SmileValidator(Validator):
    kind = "smile"
    version = "mediapipe-face-blendshape-v1"

    def __init__(self, analyzer: FaceAnalyzer) -> None:
        self.analyzer = analyzer

    async def validate(
        self,
        frames: list[Frame],
        quest: QuestConfig,
        calibration: CalibrationClaims,
    ) -> ValidationResult:
        delta = float(quest.validator_config.get("delta", 0.35))
        absolute = float(quest.validator_config.get("absolute", 0.55))
        consensus = int(quest.validator_config.get("consensus", 4))
        scores = [self.analyzer.smile_score(frame) for frame in frames]
        matches = sum(
            score is not None and score >= absolute and score - calibration.neutral_smile >= delta
            for score in scores
        )
        confidence = max((score for score in scores if score is not None), default=0.0)
        return ValidationResult(
            passed=matches >= consensus,
            progress=min(1.0, matches / consensus),
            confidence=confidence,
            note=f"smile: {confidence:.0%}",
            reason="smile_consensus",
        )
