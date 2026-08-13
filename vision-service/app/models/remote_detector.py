from __future__ import annotations

import asyncio
from typing import Any, Protocol

import cv2

from app.models.contracts import Detection
from app.validators.base import Frame


class RemoteMethod(Protocol):
    def remote(self, frames: list[bytes]) -> list[list[dict[str, Any]]]: ...


class RemoteWorker(Protocol):
    detect_batch: RemoteMethod


class ModalObjectDetector:
    def __init__(self, worker: RemoteWorker) -> None:
        self._worker = worker

    async def detect_batch(self, frames: list[Frame]) -> list[list[Detection]]:
        encoded: list[bytes] = []
        for frame in frames:
            ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            if not ok:
                raise ValueError("could not encode GPU frame")
            encoded.append(jpeg.tobytes())
        result = await asyncio.to_thread(self._worker.detect_batch.remote, encoded)
        return [[Detection.model_validate(item) for item in frame] for frame in result]

    async def warm(self) -> None:
        warm_method = getattr(self._worker, "warm", None)
        if warm_method is not None:
            await asyncio.to_thread(warm_method.remote)
