from __future__ import annotations

from typing import Protocol

import cv2

from app.models.contracts import Detection
from app.models.turn import CalibrationClaims, QuestConfig
from app.validators.base import Frame, ValidationResult, Validator


class ObjectDetector(Protocol):
    async def detect_batch(self, frames: list[Frame]) -> list[list[Detection]]: ...


class ObjectFallback(Protocol):
    async def verify(self, frame: Frame, target_class: str) -> tuple[bool, float]: ...


def _clarity(frame: Frame) -> float:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    exposure = float(gray.mean())
    exposure_penalty = abs(exposure - 128.0)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var()) - exposure_penalty


class ObjectValidator(Validator):
    kind = "object"
    version = "rfdetr-large-coco-v1"

    def __init__(self, detector: ObjectDetector, fallback: ObjectFallback | None = None) -> None:
        self.detector = detector
        self.fallback = fallback

    async def validate(
        self,
        frames: list[Frame],
        quest: QuestConfig,
        calibration: CalibrationClaims,
    ) -> ValidationResult:
        if quest.target_class is None:
            raise ValueError("object quest is missing target_class")
        threshold = float(quest.validator_config.get("confidence", 0.65))
        borderline = float(quest.validator_config.get("borderlineMin", 0.45))
        consensus = int(quest.validator_config.get("consensus", 3))
        batches = await self.detector.detect_batch(frames)
        target_per_frame = [
            max(
                (item.confidence for item in detections if item.label == quest.target_class),
                default=0.0,
            )
            for detections in batches
        ]
        matches = sum(score >= threshold for score in target_per_frame)
        best_frame_index = max(range(len(target_per_frame)), key=target_per_frame.__getitem__)
        visible_detections = [
            item.model_copy(update={"target": item.label == quest.target_class})
            for item in batches[best_frame_index]
        ]
        best = max(target_per_frame, default=0.0)
        fallback_reason: str | None = None

        if matches >= consensus:
            return ValidationResult(
                True,
                1.0,
                best,
                visible_detections,
                quest.target_class,
                "rfdetr_consensus",
            )

        if borderline <= best < threshold and self.fallback is not None:
            candidates = [
                index
                for index, confidence in enumerate(target_per_frame)
                if confidence >= borderline
            ]
            frame_index = max(candidates, key=lambda index: _clarity(frames[index]))
            try:
                matched, confidence = await self.fallback.verify(
                    frames[frame_index], quest.target_class
                )
                fallback_reason = "gemini_rejected"
                if matched and confidence >= 0.90:
                    return ValidationResult(
                        True,
                        1.0,
                        confidence,
                        visible_detections,
                        quest.target_class,
                        "gemini_borderline",
                    )
            except Exception:
                # Gemini is optional: its outage must not abort or fail the active turn.
                fallback_reason = "gemini_unavailable"

        return ValidationResult(
            False,
            min(0.99, matches / consensus),
            best,
            visible_detections,
            quest.target_class if best >= borderline else None,
            fallback_reason or "object_consensus",
        )
