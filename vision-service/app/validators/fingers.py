from __future__ import annotations

from dataclasses import dataclass
from math import acos, degrees
from typing import Protocol

from app.models.turn import CalibrationClaims, QuestConfig
from app.validators.base import Frame, ValidationResult, Validator


@dataclass(frozen=True, slots=True)
class Point:
    x: float
    y: float
    z: float = 0


@dataclass(frozen=True, slots=True)
class HandLandmarks:
    points: list[Point]
    handedness: str


class HandAnalyzer(Protocol):
    def analyze(self, frame: Frame) -> list[HandLandmarks]: ...


def _angle(a: Point, b: Point, c: Point) -> float:
    ab = (a.x - b.x, a.y - b.y, a.z - b.z)
    cb = (c.x - b.x, c.y - b.y, c.z - b.z)
    dot = sum(left * right for left, right in zip(ab, cb, strict=True))
    norm = (sum(value * value for value in ab) * sum(value * value for value in cb)) ** 0.5
    if norm == 0:
        return 0
    return degrees(acos(max(-1.0, min(1.0, dot / norm))))


def count_extended_fingers(hand: HandLandmarks) -> int:
    if len(hand.points) != 21:
        return 0
    points = hand.points
    thumb_angle = _angle(points[1], points[2], points[4])
    thumb_direction = (
        points[4].x < points[3].x
        if hand.handedness.lower() == "right"
        else points[4].x > points[3].x
    )
    count = int(thumb_angle > 145 and thumb_direction)
    for mcp, pip, dip, tip in ((5, 6, 7, 8), (9, 10, 11, 12), (13, 14, 15, 16), (17, 18, 19, 20)):
        straight = _angle(points[mcp], points[pip], points[tip]) > 155
        straight = straight and _angle(points[pip], points[dip], points[tip]) > 150
        count += int(straight and points[tip].y < points[pip].y)
    return count


class FingerValidator(Validator):
    kind = "fingers"
    version = "mediapipe-hand-v1"

    def __init__(self, analyzer: HandAnalyzer) -> None:
        self.analyzer = analyzer

    async def validate(
        self,
        frames: list[Frame],
        quest: QuestConfig,
        calibration: CalibrationClaims,
    ) -> ValidationResult:
        if quest.finger_count is None:
            raise ValueError("finger quest is missing finger_count")
        consensus = int(quest.validator_config.get("consensus", 4))
        counts: list[int] = []
        for frame in frames:
            hands = self.analyzer.analyze(frame)
            counts.append(count_extended_fingers(hands[0]) if len(hands) == 1 else -1)
        matches = sum(value == quest.finger_count for value in counts)
        return ValidationResult(
            passed=matches >= consensus,
            progress=min(1.0, matches / consensus),
            confidence=matches / len(frames),
            note=f"finger counts: {counts}",
            reason="finger_consensus",
        )
