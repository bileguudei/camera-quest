from __future__ import annotations

import time
from collections import Counter

from app.models.turn import CalibrationClaims
from app.security.calibration_token import CalibrationTokenSigner
from app.validators.base import Frame
from app.validators.color import HSV_RANGES, color_ratio
from app.validators.fingers import HandAnalyzer
from app.validators.object import ObjectDetector
from app.validators.smile import FaceAnalyzer


class CalibrationService:
    def __init__(
        self,
        detector: ObjectDetector,
        hand_analyzer: HandAnalyzer,
        face_analyzer: FaceAnalyzer,
        signer: CalibrationTokenSigner,
    ) -> None:
        self._detector = detector
        self._hands = hand_analyzer
        self._face = face_analyzer
        self._signer = signer

    async def calibrate(self, frames: list[Frame], subject: str) -> tuple[str, list[str]]:
        detections = await self._detector.detect_batch(frames)
        class_counts = Counter(
            detection.label
            for frame in detections
            for detection in frame
            if detection.confidence >= 0.65
        )
        background = sorted(label for label, count in class_counts.items() if count >= 3)
        color_ratios = {
            color: sum(color_ratio(frame, color) for frame in frames) / len(frames)
            for color in HSV_RANGES
        }
        smile_scores = [self._face.smile_score(frame) for frame in frames]
        valid_smiles = [score for score in smile_scores if score is not None]
        neutral_smile = sum(valid_smiles) / len(valid_smiles) if valid_smiles else 0.0
        hand_present = any(self._hands.analyze(frame) for frame in frames)
        claims = CalibrationClaims(
            sub=subject,
            exp=int(time.time()) + 600,
            background_classes=background,
            color_ratios=color_ratios,
            neutral_smile=neutral_smile,
            hand_present=hand_present,
        )
        return self._signer.sign(claims), background
