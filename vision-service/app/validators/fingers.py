from __future__ import annotations

from dataclasses import dataclass
from math import acos, degrees, sqrt
from typing import Protocol

from app.models.turn import CalibrationClaims, QuestConfig
from app.validators.base import Frame, ValidationResult, Validator, consensus_is_settled


@dataclass(frozen=True, slots=True)
class Point:
    x: float
    y: float
    z: float = 0


@dataclass(frozen=True, slots=True)
class HandLandmarks:
    points: list[Point]
    handedness: str
    world_points: list[Point] | None = None
    handedness_confidence: float = 1.0


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


def _distance(a: Point, b: Point) -> float:
    return sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)


def _center(points: list[Point], indexes: tuple[int, ...]) -> Point:
    size = len(indexes)
    return Point(
        x=sum(points[index].x for index in indexes) / size,
        y=sum(points[index].y for index in indexes) / size,
        z=sum(points[index].z for index in indexes) / size,
    )


def _palm_span(hand: HandLandmarks) -> float:
    if len(hand.points) != 21:
        return 0
    return max(
        _distance(hand.points[0], hand.points[9]),
        _distance(hand.points[5], hand.points[17]),
    )


def _prominent_hand(
    hands: list[HandLandmarks],
    minimum_span: float,
) -> HandLandmarks | None:
    """Keep the clearly dominant hand while rejecting two real hands.

    Full-frame capture can produce a tiny secondary MediaPipe detection near an
    edge. Treating every second detection as a real hand discarded otherwise
    stable gestures; two similarly sized hands remain intentionally ambiguous.
    """
    candidates = sorted(
        ((hand, _palm_span(hand)) for hand in hands),
        key=lambda item: item[1],
        reverse=True,
    )
    candidates = [item for item in candidates if item[1] >= minimum_span]
    if not candidates:
        return None
    if len(candidates) > 1 and candidates[0][1] < candidates[1][1] * 1.35:
        return None
    return candidates[0][0]


def count_extended_fingers(
    hand: HandLandmarks,
    *,
    min_palm_span: float = 0.06,
    min_finger_reach: float = 0.12,
) -> int | None:
    """Count a valid hand without assuming that its fingers point upward.

    World landmarks make joint angles independent of camera rotation. Normalized
    landmarks are still used to reject tiny, noisy detections before they can
    contribute to the temporal consensus.
    """
    if len(hand.points) != 21:
        return None

    normalized = hand.points
    # A cropped hand often leaves plausible joint angles but an invented tip
    # just outside the image. Such a partial hand must never enter consensus.
    if any(not -0.02 <= point.x <= 1.02 or not -0.02 <= point.y <= 1.02 for point in normalized):
        return None
    palm_span = _palm_span(hand)
    if palm_span < min_palm_span:
        return None

    points = hand.world_points if hand.world_points and len(hand.world_points) == 21 else normalized
    palm_scale = max(_distance(points[0], points[9]), _distance(points[5], points[17]))
    if palm_scale == 0:
        return None
    palm_center = _center(points, (5, 9, 13, 17))
    normalized_palm_center = _center(normalized, (5, 9, 13, 17))

    thumb_straight = _angle(points[1], points[2], points[3]) > 135
    thumb_straight = thumb_straight and _angle(points[2], points[3], points[4]) > 140
    thumb_reaches_out = (
        _distance(points[4], palm_center)
        > _distance(points[3], palm_center) + 0.08 * palm_scale
    )
    thumb_reaches_out = thumb_reaches_out and (
        _distance(points[4], points[0]) > _distance(points[3], points[0]) + 0.08 * palm_scale
    )
    thumb_reaches_out = thumb_reaches_out and (
        _distance(normalized[4], normalized_palm_center)
        > _distance(normalized[3], normalized_palm_center) + 0.12 * palm_span
    )
    count = int(thumb_straight and thumb_reaches_out)
    for mcp, pip, dip, tip in ((5, 6, 7, 8), (9, 10, 11, 12), (13, 14, 15, 16), (17, 18, 19, 20)):
        straight = _angle(points[mcp], points[pip], points[tip]) > 145
        straight = straight and _angle(points[pip], points[dip], points[tip]) > 140
        image_reaches_out = (
            _distance(normalized[tip], normalized_palm_center)
            > _distance(normalized[pip], normalized_palm_center) + min_finger_reach * palm_span
        )
        image_reaches_out = image_reaches_out and (
            _distance(normalized[tip], normalized_palm_center)
            > _distance(normalized[dip], normalized_palm_center) + 0.08 * palm_span
        )
        count += int(straight and image_reaches_out)
    return count


class FingerValidator(Validator):
    kind = "fingers"
    version = "mediapipe-hand-v4"

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
        consensus = int(quest.validator_config.get("consensus", 3))
        min_palm_span = float(quest.validator_config.get("minPalmSpan", 0.06))
        min_finger_reach = float(quest.validator_config.get("minFingerReach", 0.12))
        counts: list[int] = []
        for frame in frames:
            hands = self.analyzer.analyze(frame)
            hand = _prominent_hand(hands, min_palm_span)
            count = (
                count_extended_fingers(
                    hand,
                    min_palm_span=min_palm_span,
                    min_finger_reach=min_finger_reach,
                )
                if hand is not None
                else None
            )
            counts.append(count if count is not None else -1)
            matches = sum(value == quest.finger_count for value in counts)
            if consensus_is_settled(matches, len(counts), len(frames), consensus):
                break
        matches = sum(value == quest.finger_count for value in counts)
        return ValidationResult(
            passed=matches >= consensus,
            progress=min(1.0, matches / consensus),
            confidence=matches / len(frames),
            note=f"finger counts: {counts}",
            reason="finger_consensus",
        )
