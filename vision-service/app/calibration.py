from __future__ import annotations

import asyncio
import time
from collections import Counter

from app.models.turn import CalibrationClaims
from app.security.calibration_token import CalibrationTokenSigner
from app.validators.base import Frame
from app.validators.color import HSV_RANGES, color_ratio
from app.validators.object import ObjectDetector
from app.validators.smile import FaceAnalyzer


class CalibrationService:
    def __init__(
        self,
        detector: ObjectDetector,
        face_analyzer: FaceAnalyzer,
        signer: CalibrationTokenSigner,
    ) -> None:
        self._detector = detector
        self._face = face_analyzer
        self._signer = signer

    async def calibrate(self, frames: list[Frame], subject: str) -> tuple[str, list[str]]:
        # GPU object inference and the independent CPU baselines can run at the
        # same time. Keeping them serial made every handoff pay both latencies.
        detections, color_ratios, neutral_smile = await asyncio.gather(
            self._detector.detect_batch(frames),
            asyncio.to_thread(self._color_baseline, frames),
            asyncio.to_thread(self._smile_baseline, frames),
        )
        class_counts = Counter(
            detection.label
            for frame in detections
            for detection in frame
            if detection.confidence >= 0.65
        )
        background = sorted(label for label, count in class_counts.items() if count >= 3)
        claims = CalibrationClaims(
            sub=subject,
            exp=int(time.time()) + 600,
            background_classes=background,
            color_ratios=color_ratios,
            neutral_smile=neutral_smile,
        )
        return self._signer.sign(claims), background

    @staticmethod
    def _color_baseline(frames: list[Frame]) -> dict[str, float]:
        return {
            color: sum(color_ratio(frame, color) for frame in frames) / len(frames)
            for color in HSV_RANGES
        }

    def _smile_baseline(self, frames: list[Frame]) -> float:
        smile_scores = [self._face.smile_score(frame) for frame in frames]
        valid_smiles = [score for score in smile_scores if score is not None]
        return sum(valid_smiles) / len(valid_smiles) if valid_smiles else 0.0
