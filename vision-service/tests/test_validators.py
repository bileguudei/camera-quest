from __future__ import annotations

from typing import cast

import cv2
import numpy as np
import pytest

from app.models.contracts import Box, Detection
from app.models.turn import CalibrationClaims, QuestConfig
from app.validators.base import Frame
from app.validators.color import ColorValidator
from app.validators.fingers import FingerValidator, HandLandmarks, Point
from app.validators.object import ObjectValidator
from app.validators.registry import ValidatorRegistry
from app.validators.smile import SmileValidator


class FakeDetector:
    def __init__(self, confidences: list[float]) -> None:
        self.confidences = confidences

    async def detect_batch(self, frames: list[np.ndarray]) -> list[list[Detection]]:
        del frames
        return [
            [
                Detection(
                    label="bottle",
                    confidence=confidence,
                    box=Box(x=0.2, y=0.2, w=0.4, h=0.4),
                    target=False,
                )
            ]
            for confidence in self.confidences
        ]


class FakeFallback:
    async def verify(self, frame: np.ndarray, target_class: str) -> tuple[bool, float]:
        del frame, target_class
        return True, 0.92


class FailingFallback:
    async def verify(self, frame: np.ndarray, target_class: str) -> tuple[bool, float]:
        del frame, target_class
        raise RuntimeError("fallback unavailable")


class FakeHands:
    def __init__(self, frames: list[list[HandLandmarks]]) -> None:
        self.frames = iter(frames)

    def analyze(self, frame: np.ndarray) -> list[HandLandmarks]:
        del frame
        return next(self.frames)


def hand_with_fingers(count: int) -> HandLandmarks:
    points = [Point(0.5, 0.8) for _ in range(21)]
    if count >= 1:
        points[1], points[2], points[3], points[4] = (
            Point(0.5, 0.8),
            Point(0.4, 0.8),
            Point(0.3, 0.8),
            Point(0.2, 0.8),
        )
    for index, (mcp, pip, dip, tip) in enumerate(
        ((5, 6, 7, 8), (9, 10, 11, 12), (13, 14, 15, 16), (17, 18, 19, 20))
    ):
        if index >= count - 1:
            break
        x = 0.35 + index * 0.1
        points[mcp], points[pip], points[dip], points[tip] = (
            Point(x, 0.72),
            Point(x, 0.60),
            Point(x, 0.45),
            Point(x, 0.28),
        )
    return HandLandmarks(points=points, handedness="Right")


class FakeFace:
    def __init__(self, scores: list[float]) -> None:
        self.scores = iter(scores)

    def smile_score(self, frame: np.ndarray) -> float:
        del frame
        return next(self.scores)


@pytest.mark.asyncio
async def test_object_requires_three_of_five_frames() -> None:
    frames = [np.zeros((512, 512, 3), dtype=np.uint8) for _ in range(5)]
    quest = QuestConfig(
        id="q",
        key="obj-bottle",
        kind="object",
        target_class="bottle",
        validator_config={"confidence": 0.65, "borderlineMin": 0.45, "consensus": 3},
    )
    validator = ObjectValidator(FakeDetector([0.7, 0.71, 0.8, 0.2, 0.1]))
    result = await validator.validate(frames, quest, CalibrationClaims(sub="x", exp=9_999_999_999))
    assert result.passed
    assert sum(detection.target for detection in result.detections) == 1


@pytest.mark.asyncio
async def test_borderline_object_uses_high_confidence_fallback_only() -> None:
    frames = [np.zeros((512, 512, 3), dtype=np.uint8) for _ in range(5)]
    quest = QuestConfig(
        id="q",
        key="obj-bottle",
        kind="object",
        target_class="bottle",
        validator_config={"confidence": 0.65, "borderlineMin": 0.45, "consensus": 3},
    )
    result = await ObjectValidator(
        FakeDetector([0.5, 0.2, 0.1, 0.1, 0.1]), FakeFallback()
    ).validate(frames, quest, CalibrationClaims(sub="x", exp=9_999_999_999))
    assert result.passed
    assert result.reason == "gemini_borderline"


@pytest.mark.asyncio
async def test_gemini_outage_keeps_object_scan_running() -> None:
    frames = [np.zeros((512, 512, 3), dtype=np.uint8) for _ in range(5)]
    quest = QuestConfig(
        id="q",
        key="obj-bottle",
        kind="object",
        target_class="bottle",
        validator_config={"confidence": 0.65, "borderlineMin": 0.45, "consensus": 3},
    )
    result = await ObjectValidator(
        FakeDetector([0.5, 0.2, 0.1, 0.1, 0.1]), FailingFallback()
    ).validate(frames, quest, CalibrationClaims(sub="x", exp=9_999_999_999))
    assert not result.passed
    assert result.reason == "gemini_unavailable"


@pytest.mark.asyncio
@pytest.mark.parametrize("target", [1, 2, 3, 4, 5])
async def test_finger_validator_recognizes_each_supported_count(target: int) -> None:
    frames = [np.zeros((512, 512, 3), dtype=np.uint8) for _ in range(5)]
    hand = hand_with_fingers(target)
    analyzer = FakeHands([[hand], [hand], [hand], [hand], []])
    quest = QuestConfig(
        id="q",
        key=f"fingers-{target}",
        kind="fingers",
        finger_count=target,
        validator_config={"consensus": 4},
    )
    result = await FingerValidator(analyzer).validate(
        frames, quest, CalibrationClaims(sub="x", exp=9_999_999_999)
    )
    assert result.passed
    assert result.confidence == 0.8


@pytest.mark.asyncio
async def test_color_uses_new_area_above_calibrated_baseline() -> None:
    blue_hsv = np.zeros((512, 512, 3), dtype=np.uint8)
    blue_hsv[:, :200] = (110, 255, 255)
    blue = cv2.cvtColor(blue_hsv, cv2.COLOR_HSV2BGR)
    quest = QuestConfig(
        id="q",
        key="color-blue",
        kind="color",
        target_color="blue",
        validator_config={"minArea": 0.12, "saturation": 0.45, "value": 0.25, "consensus": 4},
    )
    result = await ColorValidator().validate(
        [cast(Frame, blue)] * 5,
        quest,
        CalibrationClaims(sub="x", exp=9_999_999_999, color_ratios={"blue": 0.05}),
    )
    assert result.passed


@pytest.mark.asyncio
async def test_smile_requires_four_frames_above_delta_and_absolute() -> None:
    frames = [np.zeros((512, 512, 3), dtype=np.uint8) for _ in range(5)]
    quest = QuestConfig(
        id="q",
        key="smile",
        kind="smile",
        validator_config={"delta": 0.35, "absolute": 0.55, "consensus": 4},
    )
    result = await SmileValidator(FakeFace([0.7, 0.72, 0.75, 0.8, 0.2])).validate(
        frames,
        quest,
        CalibrationClaims(sub="x", exp=9_999_999_999, neutral_smile=0.1),
    )
    assert result.passed


def test_registry_rejects_unknown_kind() -> None:
    registry = ValidatorRegistry([ColorValidator()])
    with pytest.raises(ValueError, match="unsupported"):
        registry.for_kind("semantic")
