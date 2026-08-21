from __future__ import annotations

from typing import cast

import cv2
import numpy as np
import pytest

from app.models.contracts import Box, Detection
from app.models.turn import CalibrationClaims, QuestConfig
from app.validators.base import Frame
from app.validators.color import ColorValidator
from app.validators.object import ObjectValidator
from app.validators.registry import ValidatorRegistry
from app.validators.smile import SmileValidator


class FakeDetector:
    def __init__(self, confidences: list[float], label: str = "bottle") -> None:
        self.confidences = confidences
        self.label = label

    async def detect_batch(self, frames: list[np.ndarray]) -> list[list[Detection]]:
        del frames
        return [
            [
                Detection(
                    label=self.label,
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


class FakeFace:
    def __init__(self, scores: list[float]) -> None:
        self.scores = iter(scores)
        self.calls = 0

    def smile_score(self, frame: np.ndarray) -> float:
        del frame
        self.calls += 1
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
async def test_backpack_scores_after_two_stable_frames_at_playtest_threshold() -> None:
    frames = [np.zeros((512, 512, 3), dtype=np.uint8) for _ in range(5)]
    quest = QuestConfig(
        id="q",
        key="obj-backpack",
        kind="object",
        target_class="backpack",
        validator_config={"confidence": 0.55, "borderlineMin": 0.45, "consensus": 2},
    )

    result = await ObjectValidator(
        FakeDetector([0.58, 0.57, 0.30, 0.20, 0.10], label="backpack")
    ).validate(frames, quest, CalibrationClaims(sub="x", exp=9_999_999_999))

    assert result.passed
    assert result.progress == 1.0
    assert sum(detection.target for detection in result.detections) == 1


@pytest.mark.asyncio
async def test_unconfirmed_object_never_draws_a_success_box() -> None:
    frames = [np.zeros((512, 512, 3), dtype=np.uint8) for _ in range(5)]
    quest = QuestConfig(
        id="q",
        key="obj-backpack",
        kind="object",
        target_class="backpack",
        validator_config={"confidence": 0.55, "borderlineMin": 0.45, "consensus": 2},
    )

    result = await ObjectValidator(
        FakeDetector([0.72, 0.20, 0.10, 0.10, 0.10], label="backpack")
    ).validate(frames, quest, CalibrationClaims(sub="x", exp=9_999_999_999))

    assert not result.passed
    assert result.progress == 0.5
    assert not any(detection.target for detection in result.detections)


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
async def test_color_accepts_a_phone_sized_muted_blue_region() -> None:
    frame_hsv = np.zeros((512, 512, 3), dtype=np.uint8)
    # Real cameras commonly shift blue toward cyan and reduce saturation.
    frame_hsv[180:300, 190:310] = (88, 90, 150)
    frame = cv2.cvtColor(frame_hsv, cv2.COLOR_HSV2BGR)
    quest = QuestConfig(
        id="q",
        key="color-blue",
        kind="color",
        target_color="blue",
        validator_config={},
    )

    result = await ColorValidator().validate(
        [cast(Frame, frame)] * 5,
        quest,
        CalibrationClaims(
            sub="x", exp=9_999_999_999, color_ratios={"blue": 0.005}
        ),
    )

    assert result.passed


@pytest.mark.asyncio
async def test_color_accepts_a_mid_distance_object_with_production_thresholds() -> None:
    frame_hsv = np.zeros((512, 512, 3), dtype=np.uint8)
    # Roughly 3% of the frame: visible at arm's length, without pushing the
    # object against the camera lens.
    frame_hsv[210:290, 206:306] = (110, 120, 180)
    frame = cv2.cvtColor(frame_hsv, cv2.COLOR_HSV2BGR)
    quest = QuestConfig(
        id="q",
        key="color-blue",
        kind="color",
        target_color="blue",
        validator_config={
            "minArea": 0.025,
            "minRegionArea": 0.015,
            "saturation": 0.30,
            "value": 0.18,
            "consensus": 3,
        },
    )

    result = await ColorValidator().validate(
        [cast(Frame, frame)] * 5,
        quest,
        CalibrationClaims(
            sub="x", exp=9_999_999_999, color_ratios={"blue": 0.005}
        ),
    )

    assert result.passed


@pytest.mark.asyncio
async def test_color_rejects_scattered_matching_pixels_without_an_object_region() -> None:
    frame_hsv = np.zeros((512, 512, 3), dtype=np.uint8)
    frame_hsv[::5, ::5] = (110, 255, 255)
    frame = cv2.cvtColor(frame_hsv, cv2.COLOR_HSV2BGR)
    quest = QuestConfig(
        id="q",
        key="color-blue",
        kind="color",
        target_color="blue",
        validator_config={
            "minArea": 0.025,
            "minRegionArea": 0.015,
            "saturation": 0.28,
            "value": 0.18,
            "consensus": 3,
        },
    )

    result = await ColorValidator().validate(
        [cast(Frame, frame)] * 5,
        quest,
        CalibrationClaims(sub="x", exp=9_999_999_999),
    )

    assert not result.passed


@pytest.mark.asyncio
async def test_smile_requires_four_frames_above_delta_and_absolute() -> None:
    frames = [np.zeros((512, 512, 3), dtype=np.uint8) for _ in range(5)]
    quest = QuestConfig(
        id="q",
        key="smile",
        kind="smile",
        validator_config={"delta": 0.35, "absolute": 0.55, "consensus": 4},
    )
    analyzer = FakeFace([0.7, 0.72, 0.75, 0.8, 0.2])
    result = await SmileValidator(analyzer).validate(
        frames,
        quest,
        CalibrationClaims(sub="x", exp=9_999_999_999, neutral_smile=0.1),
    )
    assert result.passed
    assert analyzer.calls == 4


def test_registry_rejects_unknown_kind() -> None:
    registry = ValidatorRegistry([ColorValidator()])
    with pytest.raises(ValueError, match="unsupported"):
        registry.for_kind("semantic")
