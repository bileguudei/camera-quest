from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp  # type: ignore[import-not-found]

from app.validators.base import Frame
from app.validators.fingers import HandLandmarks, Point


class MediaPipeHandAnalyzer:
    def __init__(self) -> None:
        self._hands = mp.solutions.hands.Hands(
            static_image_mode=True,
            max_num_hands=2,
            min_detection_confidence=0.55,
            min_tracking_confidence=0.5,
        )

    def analyze(self, frame: Frame) -> list[HandLandmarks]:
        result = self._hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        landmarks = result.multi_hand_landmarks or []
        handedness = result.multi_handedness or []
        return [
            HandLandmarks(
                points=[Point(point.x, point.y, point.z) for point in hand.landmark],
                handedness=handedness[index].classification[0].label,
            )
            for index, hand in enumerate(landmarks)
        ]


class MediaPipeFaceAnalyzer:
    def __init__(self, model_path: str) -> None:
        if not Path(model_path).is_file():
            raise FileNotFoundError(f"Face landmarker asset missing: {model_path}")
        base_options = mp.tasks.BaseOptions(model_asset_path=model_path)
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_faces=3,
            output_face_blendshapes=True,
        )
        self._landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)

    def smile_score(self, frame: Frame) -> float | None:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result: Any = self._landmarker.detect(image)
        if not result.face_landmarks:
            return None
        areas = []
        for landmarks in result.face_landmarks:
            xs = [point.x for point in landmarks]
            ys = [point.y for point in landmarks]
            areas.append((max(xs) - min(xs)) * (max(ys) - min(ys)))
        index = max(range(len(areas)), key=areas.__getitem__)
        categories = {
            category.category_name: float(category.score)
            for category in result.face_blendshapes[index]
        }
        return (categories.get("mouthSmileLeft", 0.0) + categories.get("mouthSmileRight", 0.0)) / 2
