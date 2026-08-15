from __future__ import annotations

import cv2
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.validators.base import Frame


class GeminiMatch(BaseModel):
    match: bool
    confidence: float = Field(ge=0, le=1)


class GeminiObjectFallback:
    def __init__(self, api_key: str, model: str) -> None:
        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def verify(self, frame: Frame, target_class: str) -> tuple[bool, float]:
        encoded, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 82])
        if not encoded:
            return False, 0
        response = await self._client.aio.models.generate_content(
            model=self._model,
            contents=types.Content(
                parts=[
                    types.Part.from_text(
                        text=(
                            f"Is the main object in this image a {target_class}? "
                            "Return false when uncertain or when only a screen/photo depicts it."
                        )
                    ),
                    types.Part.from_bytes(data=jpeg.tobytes(), mime_type="image/jpeg"),
                ]
            ),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GeminiMatch,
                temperature=0,
            ),
        )
        parsed = GeminiMatch.model_validate_json(response.text or "{}")
        return parsed.match, parsed.confidence
