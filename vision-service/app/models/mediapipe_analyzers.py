from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import cv2
import mediapipe as mp  # type: ignore

from app.validators.base import Frame
from app.validators.fingers import HandLandmarks, Point


class MediaPipeHandAnalyzer:
    def __init__(self, model_path: str) -> None:
        if not Path(model_path).is_file():
            raise FileNotFoundError(f"Hand landmarker asset missing: {model_path}")
        base_options = mp.tasks.BaseOptions(model_asset_path=model_path)
        options = mp.tasks.vision.HandLandmarkerOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_hands=2,
            # Geometry and multi-frame consensus reject noise downstream. A
            # high detector gate was dropping small but otherwise valid hands.
            min_hand_detection_confidence=0.55,
            min_hand_presence_confidence=0.55,
            min_tracking_confidence=0.5,
        )
        self._landmarker = mp.tasks.vision.HandLandmarker.create_from_options(options)

    def _detect(self, frame: Frame) -> Any:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        return self._landmarker.detect(image)

    @staticmethod
    def _add_edge_context(frame: Frame, scale: float = 0.7) -> Frame:
        """Move edge-to-edge hands inward without inventing new hand features."""
        height, width = frame.shape[:2]
        scaled_width = max(1, round(width * scale))
        scaled_height = max(1, round(height * scale))
        reduced = cv2.resize(frame, (scaled_width, scaled_height), interpolation=cv2.INTER_AREA)
        horizontal = width - scaled_width
        vertical = height - scaled_height
        return cast(
            Frame,
            cv2.copyMakeBorder(
                reduced,
                vertical // 2,
                vertical - vertical // 2,
                horizontal // 2,
                horizontal - horizontal // 2,
                cv2.BORDER_REPLICATE,
            ),
        )

    def analyze(self, frame: Frame) -> list[HandLandmarks]:
        result = self._detect(frame)
        if not result.hand_landmarks:
            # MediaPipe's palm detector commonly misses a valid hand that fills
            # the camera surface. A second, padded view supplies the missing
            # edge context; downstream geometry and 3/5 consensus still decide.
            result = self._detect(self._add_edge_context(frame))
        return [
            HandLandmarks(
                points=[Point(point.x, point.y, point.z) for point in hand],
                handedness=result.handedness[index][0].category_name,
                world_points=[
                    Point(point.x, point.y, point.z)
                    for point in result.hand_world_landmarks[index]
                ],
                handedness_confidence=float(result.handedness[index][0].score),
            )
            for index, hand in enumerate(result.hand_landmarks)
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
