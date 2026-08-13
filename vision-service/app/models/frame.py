from __future__ import annotations

from typing import cast

import cv2
import numpy as np
from fastapi import UploadFile

from app.validators.base import Frame

FRAME_COUNT = 5
FRAME_SIZE = 512
MAX_FRAME_BYTES = 300_000


class InvalidFrame(Exception):
    pass


async def decode_frames(files: list[UploadFile]) -> list[Frame]:
    if len(files) != FRAME_COUNT:
        raise InvalidFrame(f"expected {FRAME_COUNT} frames")
    decoded: list[Frame] = []
    for file in files:
        if file.content_type not in {"image/jpeg", "image/jpg"}:
            raise InvalidFrame("only JPEG frames are accepted")
        raw = await file.read(MAX_FRAME_BYTES + 1)
        if not raw or len(raw) > MAX_FRAME_BYTES:
            raise InvalidFrame("invalid frame size")
        image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None or image.shape[:2] != (FRAME_SIZE, FRAME_SIZE):
            raise InvalidFrame("frame must be 512x512")
        decoded.append(cast(Frame, image))
    return decoded
