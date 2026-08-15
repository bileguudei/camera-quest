from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from app.models.onnx_detector import OnnxObjectDetector


class FakeSession:
    def __init__(self) -> None:
        self.batch: np.ndarray[Any, np.dtype[np.float32]] | None = None

    def run(
        self,
        output_names: object,
        feed: dict[str, np.ndarray[Any, np.dtype[np.float32]]],
    ) -> list[np.ndarray[Any, np.dtype[np.float32]]]:
        del output_names
        self.batch = feed["images"]
        boxes = np.tile(
            np.array([[[0.5, 0.5, 0.2, 0.4]]], dtype=np.float32),
            (5, 1, 1),
        )
        logits = np.full((5, 1, 91), -10, dtype=np.float32)
        logits[:, 0, 44] = 2
        return [boxes, logits]


@pytest.mark.asyncio
async def test_in_process_detector_uses_decoded_frames_without_a_remote_jpeg_hop() -> None:
    detector = object.__new__(OnnxObjectDetector)
    session = FakeSession()
    detector._session = session
    detector._input_name = "images"
    detector._output_names = ["dets", "labels"]
    detector._class_names = {"44": "bottle"}
    frames = [np.zeros((512, 512, 3), dtype=np.uint8) for _ in range(5)]

    result = await detector.detect_batch(frames)

    assert session.batch is not None
    assert session.batch.shape == (5, 3, 512, 512)
    assert all(frame[0].label == "bottle" for frame in result)
    assert all(frame[0].box.x == pytest.approx(0.4) for frame in result)
