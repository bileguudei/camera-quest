from __future__ import annotations

from collections import Counter
from typing import Protocol

import cv2

from app.models.contracts import Box, Detection
from app.models.turn import CalibrationClaims, QuestConfig
from app.validators.base import Frame, ValidationResult, Validator

# One physical thing can still win two RF-DETR queries when it fills the lens.
# Counting instances — "two bottles" — has to collapse those first.
DUPLICATE_IOU = 0.55


class ObjectDetector(Protocol):
    async def detect_batch(self, frames: list[Frame]) -> list[list[Detection]]: ...


class ObjectFallback(Protocol):
    async def verify(self, frame: Frame, target_class: str) -> tuple[bool, float]: ...


def _clarity(frame: Frame) -> float:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    exposure = float(gray.mean())
    exposure_penalty = abs(exposure - 128.0)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var()) - exposure_penalty


def _overlap(first: Box, second: Box) -> float:
    width = max(0.0, min(first.x + first.w, second.x + second.w) - max(first.x, second.x))
    height = max(0.0, min(first.y + first.h, second.y + second.h) - max(first.y, second.y))
    intersection = width * height
    union = first.w * first.h + second.w * second.h - intersection
    return intersection / union if union > 0 else 0.0


def _distinct(detections: list[Detection]) -> list[Detection]:
    kept: list[Detection] = []
    for candidate in sorted(detections, key=lambda item: item.confidence, reverse=True):
        if any(
            other.label == candidate.label and _overlap(other.box, candidate.box) >= DUPLICATE_IOU
            for other in kept
        ):
            continue
        kept.append(candidate)
    return kept


def required_classes(quest: QuestConfig) -> Counter[str]:
    """
    What the turn asks to be in shot at once. `targetClasses` carries the harder
    conditions — two different things, or two of the same — and a repeat in that
    list is how a count is expressed. Without it the quest is the plain one.
    """
    configured = quest.validator_config.get("targetClasses")
    if isinstance(configured, list) and configured:
        return Counter(str(item) for item in configured)
    if quest.target_class is None:
        raise ValueError("object quest is missing target_class")
    return Counter({quest.target_class: 1})


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
        required = required_classes(quest)
        threshold = float(quest.validator_config.get("confidence", 0.55))
        borderline = float(quest.validator_config.get("borderlineMin", 0.45))
        consensus = int(quest.validator_config.get("consensus", 2))
        batches = await self.detector.detect_batch(frames)

        # Per frame: how many of each wanted class are actually in shot, and how
        # strongly each one reads. A condition only counts when one frame holds
        # everything — sweeping the room from one object to the other is exactly
        # what "at the same time" rules out.
        met_per_frame: list[set[str]] = []
        best_per_frame: list[dict[str, float]] = []
        for detections in batches:
            confident = [item for item in _distinct(detections) if item.confidence >= threshold]
            counts = Counter(item.label for item in confident)
            met_per_frame.append({name for name, need in required.items() if counts[name] >= need})
            best: dict[str, float] = {}
            for item in detections:
                best[item.label] = max(best.get(item.label, 0.0), item.confidence)
            best_per_frame.append(best)

        matches = sum(len(met) == len(required) for met in met_per_frame)
        # A single class holding across the window is what turns its box green,
        # which for a one-object quest is the same gate that awards the score.
        confirmed = {
            name
            for name in required
            if sum(name in met for met in met_per_frame) >= consensus
        }
        best_index = max(
            range(len(batches)),
            key=lambda index: (
                len(met_per_frame[index]),
                sum(best_per_frame[index].get(name, 0.0) for name in required),
            ),
        )
        best_detections = batches[best_index]
        class_best = {
            name: max((best.get(name, 0.0) for best in best_per_frame), default=0.0)
            for name in required
        }
        # The weakest wanted class is what the turn is really waiting on.
        confidence = min(class_best.values(), default=0.0)
        single = quest.target_class if len(required) == 1 and sum(required.values()) == 1 else None
        fallback_reason: str | None = None

        def visible_detections(passed: bool) -> list[Detection]:
            # Green is a success colour in the game. A single-frame candidate
            # may drive progress, but it must stay neutral until the same gate
            # that awards the score has confirmed it.
            green = set(required) if passed else confirmed
            return [
                item.model_copy(update={"target": item.label in green})
                for item in best_detections
            ]

        if matches >= consensus:
            return ValidationResult(
                True,
                1.0,
                confidence,
                visible_detections(True),
                single or " + ".join(sorted(required.elements())),
                "rfdetr_consensus" if single else "combo_consensus",
            )

        fallback = self.fallback if single is not None else None
        if fallback is not None and single is not None and borderline <= confidence < threshold:
            candidates = [
                index
                for index, best in enumerate(best_per_frame)
                if best.get(single, 0.0) >= borderline
            ]
            frame_index = max(candidates, key=lambda index: _clarity(frames[index]))
            try:
                matched, verified = await fallback.verify(frames[frame_index], single)
                fallback_reason = "gemini_rejected"
                if matched and verified >= 0.90:
                    return ValidationResult(
                        True,
                        1.0,
                        verified,
                        visible_detections(True),
                        single,
                        "gemini_borderline",
                    )
            except Exception:
                # Gemini is optional: its outage must not abort or fail the active turn.
                fallback_reason = "gemini_unavailable"

        # Part of a condition being in shot is real progress even before any one
        # frame holds all of it, so the lock ring moves rather than sitting dead.
        share = max((len(met) / len(required) for met in met_per_frame), default=0.0)
        progress = min(0.99, max(matches / consensus, 0.5 * share))
        return ValidationResult(
            False,
            progress,
            confidence,
            visible_detections(False),
            # A note drives the "not this one" callout, which only makes sense
            # when the turn wants a single thing; a condition reports itself
            # through the per-class boxes instead.
            single if single is not None and confidence >= borderline else None,
            fallback_reason or ("object_consensus" if single else "combo_consensus"),
        )
