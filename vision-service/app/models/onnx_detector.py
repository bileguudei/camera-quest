from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from app.models.contracts import Box, Detection
from app.validators.base import Frame


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class OnnxObjectDetector:
    """Run RF-DETR inside the ASGI GPU container, without a second Modal hop."""

    def __init__(
        self,
        onnx_path: str,
        manifest_path: str,
        expected_model_version: str,
    ) -> None:
        import onnxruntime as ort  # type: ignore[import-not-found]

        model_path = Path(onnx_path)
        metadata_path = Path(manifest_path)
        if not model_path.is_file() or not metadata_path.is_file():
            raise RuntimeError("RF-DETR model artifact is missing")
        manifest: dict[str, Any] = json.loads(metadata_path.read_text(encoding="utf-8"))
        if manifest.get("modelVersion") != expected_model_version:
            raise RuntimeError("RF-DETR model version mismatch")
        if _sha256(model_path) != manifest.get("artifactSha256"):
            raise RuntimeError("RF-DETR ONNX checksum mismatch")
        if "CUDAExecutionProvider" not in ort.get_available_providers():
            raise RuntimeError("ONNX Runtime CUDA provider is unavailable")

        self._session = ort.InferenceSession(
            str(model_path),
            providers=["CUDAExecutionProvider"],
        )
        if self._session.get_providers()[0] != "CUDAExecutionProvider":
            raise RuntimeError("RF-DETR must not silently fall back to CPU inference")
        self._input_name = self._session.get_inputs()[0].name
        self._output_names = [output.name for output in self._session.get_outputs()]
        self._class_names: dict[str, str] = manifest["classNames"]
        self._warm_lock = asyncio.Lock()
        self._warmed = False

    async def warm(self) -> None:
        if self._warmed:
            return
        async with self._warm_lock:
            if self._warmed:
                return
            batch = np.zeros((5, 3, 512, 512), dtype=np.float32)
            await asyncio.to_thread(
                self._session.run,
                None,
                {self._input_name: batch},
            )
            self._warmed = True

    async def detect_batch(self, frames: list[Frame]) -> list[list[Detection]]:
        if len(frames) != 5:
            raise ValueError("RF-DETR ONNX graph requires fixed batch 5")
        return await asyncio.to_thread(self._detect_batch, frames)

    def _detect_batch(self, frames: list[Frame]) -> list[list[Detection]]:
        images: list[np.ndarray[Any, np.dtype[np.float32]]] = []
        for frame in frames:
            if frame.shape[:2] != (512, 512):
                raise ValueError("GPU frame must be 512x512")
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            images.append(np.transpose(rgb, (2, 0, 1)))
        batch = np.stack(images)
        batch -= np.array([0.485, 0.456, 0.406], dtype=np.float32)[None, :, None, None]
        batch /= np.array([0.229, 0.224, 0.225], dtype=np.float32)[None, :, None, None]

        tensors = dict(
            zip(
                self._output_names,
                self._session.run(None, {self._input_name: batch}),
                strict=True,
            )
        )
        boxes = tensors["dets"]
        logits = tensors["labels"]
        scores_all = 1.0 / (1.0 + np.exp(-np.clip(logits, -88, 88)))
        scores = scores_all.max(axis=-1)
        class_ids = scores_all.argmax(axis=-1)

        output: list[list[Detection]] = []
        for frame_index in range(5):
            frame_output: list[Detection] = []
            for query_index in np.flatnonzero(scores[frame_index] >= 0.40):
                cx, cy, width, height = boxes[frame_index, query_index]
                class_id = int(class_ids[frame_index, query_index])
                frame_output.append(
                    Detection(
                        label=self._class_names.get(str(class_id), str(class_id)),
                        confidence=float(scores[frame_index, query_index]),
                        box=Box(
                            x=float(np.clip(cx - width / 2, 0, 1)),
                            y=float(np.clip(cy - height / 2, 0, 1)),
                            w=float(np.clip(width, 0.001, 1)),
                            h=float(np.clip(height, 0.001, 1)),
                        ),
                        target=False,
                    )
                )
            output.append(frame_output)
        return output
