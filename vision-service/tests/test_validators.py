from __future__ import annotations

from typing import cast

import cv2
import numpy as np
import pytest

from app.models.contracts import Box, Detection
from app.models.turn import CalibrationClaims, QuestConfig
from app.validators.base import Frame
from app.validators.color import ColorValidator
from app.validators.fingers import FingerValidator, HandLandmarks, Point, count_extended_fingers
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
        self.calls = 0

    def analyze(self, frame: np.ndarray) -> list[HandLandmarks]:
        del frame
        self.calls += 1
        return next(self.frames)


def hand_with_fingers(count: int) -> HandLandmarks:
    points = [Point(0.5, 0.8) for _ in range(21)]
    points[0] = Point(0.5, 0.86)
    points[1], points[2], points[3], points[4] = (
        Point(0.43, 0.74),
        Point(0.39, 0.69),
        Point(0.42, 0.66),
        Point(0.46, 0.68),
    )
    if count >= 1:
        points[1], points[2], points[3], points[4] = (
            Point(0.43, 0.74),
            Point(0.37, 0.70),
            Point(0.30, 0.67),
            Point(0.20, 0.65),
        )
    for index, (mcp, pip, dip, tip) in enumerate(
        ((5, 6, 7, 8), (9, 10, 11, 12), (13, 14, 15, 16), (17, 18, 19, 20))
    ):
        x = 0.38 + index * 0.08
        if index < count - 1:
            points[mcp], points[pip], points[dip], points[tip] = (
                Point(x, 0.68),
                Point(x, 0.52),
                Point(x, 0.40),
                Point(x, 0.27),
            )
        else:
            points[mcp], points[pip], points[dip], points[tip] = (
                Point(x, 0.68),
                Point(x, 0.62),
                Point(x + 0.015, 0.67),
                Point(x + 0.025, 0.72),
            )
    return HandLandmarks(points=points, handedness="Right")


def transform_hand(
    hand: HandLandmarks,
    *,
    scale: float = 1,
    quarter_turns: int = 0,
) -> HandLandmarks:
    center = Point(0.5, 0.6)

    def transform(point: Point) -> Point:
        x = (point.x - center.x) * scale
        y = (point.y - center.y) * scale
        for _ in range(quarter_turns % 4):
            x, y = -y, x
        return Point(center.x + x, center.y + y, point.z * scale)

    return HandLandmarks(
        points=[transform(point) for point in hand.points],
        handedness=hand.handedness,
        handedness_confidence=hand.handedness_confidence,
    )


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
    assert analyzer.calls == 4


@pytest.mark.parametrize("target", [1, 2, 3, 4, 5])
def test_finger_count_is_rotation_invariant(target: int) -> None:
    rotated = transform_hand(hand_with_fingers(target), quarter_turns=1)

    assert count_extended_fingers(rotated) == target


def test_folded_thumb_is_not_counted_from_horizontal_direction_alone() -> None:
    hand = hand_with_fingers(0)
    points = list(hand.points)
    # The tip is left of the IP joint (the old heuristic called that extended),
    # but the sharply bent IP joint keeps the thumb folded across the palm.
    points[1], points[2], points[3], points[4] = (
        Point(0.46, 0.74),
        Point(0.40, 0.68),
        Point(0.45, 0.62),
        Point(0.34, 0.58),
    )

    assert count_extended_fingers(HandLandmarks(points=points, handedness="Right")) == 0


def test_world_joint_angles_cannot_override_a_folded_image_hand() -> None:
    folded = hand_with_fingers(0)
    extended = hand_with_fingers(3)
    misleading = HandLandmarks(
        points=folded.points,
        world_points=extended.points,
        handedness="Right",
    )

    assert count_extended_fingers(misleading) == 0


def test_cropped_hand_landmarks_are_rejected() -> None:
    hand = hand_with_fingers(2)
    points = list(hand.points)
    points[8] = Point(1.04, points[8].y)

    assert count_extended_fingers(HandLandmarks(points=points, handedness="Right")) is None


@pytest.mark.asyncio
async def test_tiny_hand_detection_cannot_pass_a_finger_quest() -> None:
    frames = [np.zeros((512, 512, 3), dtype=np.uint8) for _ in range(5)]
    tiny_hand = transform_hand(hand_with_fingers(2), scale=0.15)
    analyzer = FakeHands([[tiny_hand]] * 5)
    quest = QuestConfig(
        id="q",
        key="fingers-2",
        kind="fingers",
        finger_count=2,
        validator_config={"consensus": 4},
    )

    result = await FingerValidator(analyzer).validate(
        frames, quest, CalibrationClaims(sub="x", exp=9_999_999_999)
    )

    assert not result.passed
    assert result.progress == 0


@pytest.mark.asyncio
async def test_finger_consensus_tolerates_handedness_label_jitter() -> None:
    frames = [np.zeros((512, 512, 3), dtype=np.uint8) for _ in range(5)]
    right = hand_with_fingers(3)
    left = HandLandmarks(
        points=right.points,
        handedness="Left",
        world_points=right.world_points,
        handedness_confidence=right.handedness_confidence,
    )
    analyzer = FakeHands([[right], [left], [right], [left], [right]])
    quest = QuestConfig(
        id="q",
        key="fingers-3",
        kind="fingers",
        finger_count=3,
        validator_config={"consensus": 4},
    )

    result = await FingerValidator(analyzer).validate(
        frames, quest, CalibrationClaims(sub="x", exp=9_999_999_999)
    )

    assert result.passed
    assert result.progress == 1
    assert analyzer.calls == 4


def test_uncertain_handedness_does_not_discard_good_landmarks() -> None:
    hand = hand_with_fingers(2)
    uncertain = HandLandmarks(
        points=hand.points,
        handedness=hand.handedness,
        world_points=hand.world_points,
        handedness_confidence=0.3,
    )

    assert count_extended_fingers(uncertain) == 2


def test_a_naturally_bent_but_reaching_index_finger_is_counted() -> None:
    hand = hand_with_fingers(0)
    points = list(hand.points)
    points[5], points[6], points[7], points[8] = (
        Point(0.42, 0.68),
        Point(0.40, 0.54),
        Point(0.43, 0.42),
        Point(0.48, 0.30),
    )

    assert count_extended_fingers(HandLandmarks(points=points, handedness="Right")) == 1


def test_perspective_compressed_extended_thumb_is_counted() -> None:
    hand = hand_with_fingers(2)
    world_points = list(hand.points)
    thumb_ip = world_points[3]
    original_tip = world_points[4]
    # A near-camera palm compresses world depth. The thumb remains straight and
    # visibly reaches outward even when its world-space palm delta is only 13%.
    world_points[4] = Point(
        thumb_ip.x + 0.3 * (original_tip.x - thumb_ip.x),
        thumb_ip.y + 0.3 * (original_tip.y - thumb_ip.y),
        thumb_ip.z + 0.3 * (original_tip.z - thumb_ip.z),
    )
    compressed = HandLandmarks(
        points=hand.points,
        handedness=hand.handedness,
        world_points=world_points,
    )

    assert count_extended_fingers(compressed) == 2


@pytest.mark.asyncio
async def test_prominent_hand_ignores_a_tiny_secondary_detection() -> None:
    frames = [np.zeros((512, 512, 3), dtype=np.uint8) for _ in range(5)]
    target = hand_with_fingers(3)
    noise = transform_hand(hand_with_fingers(5), scale=0.12)
    analyzer = FakeHands([[target, noise]] * 5)
    quest = QuestConfig(
        id="q",
        key="fingers-3",
        kind="fingers",
        finger_count=3,
        validator_config={"consensus": 4},
    )

    result = await FingerValidator(analyzer).validate(
        frames, quest, CalibrationClaims(sub="x", exp=9_999_999_999)
    )

    assert result.passed


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
        CalibrationClaims(sub="x", exp=9_999_999_999),
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
