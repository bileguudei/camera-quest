from __future__ import annotations

from typing import Final

import cv2
import numpy as np

from app.models.turn import CalibrationClaims, QuestConfig
from app.validators.base import Frame, ValidationResult, Validator

HueRange = tuple[tuple[int, int], ...]

HSV_RANGES: Final[dict[str, HueRange]] = {
    "red": ((0, 10), (170, 179)),
    "blue": ((90, 135),),
    "green": ((35, 85),),
    "yellow": ((20, 35),),
}


def color_ratio(
    frame: Frame,
    color: str,
    saturation: float = 0.45,
    value: float = 0.25,
) -> float:
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    saturation_floor = round(max(0.0, min(1.0, saturation)) * 255)
    value_floor = round(max(0.0, min(1.0, value)) * 255)
    mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
    for hue_minimum, hue_maximum in HSV_RANGES[color]:
        mask = cv2.bitwise_or(
            mask,
            cv2.inRange(
                hsv,
                np.array((hue_minimum, saturation_floor, value_floor)),
                np.array((hue_maximum, 255, 255)),
            ),
        )
    return float(np.count_nonzero(mask)) / float(mask.size)


class ColorValidator(Validator):
    kind = "color"
    version = "opencv-hsv-v1"

    async def validate(
        self,
        frames: list[Frame],
        quest: QuestConfig,
        calibration: CalibrationClaims,
    ) -> ValidationResult:
        if quest.target_color is None:
            raise ValueError("color quest is missing target_color")
        minimum = float(quest.validator_config.get("minArea", 0.12))
        saturation = float(quest.validator_config.get("saturation", 0.45))
        value = float(quest.validator_config.get("value", 0.25))
        consensus = int(quest.validator_config.get("consensus", 4))
        baseline = calibration.color_ratios.get(quest.target_color, 0.0)
        ratios = [
            max(
                0.0,
                color_ratio(frame, quest.target_color, saturation, value) - baseline,
            )
            for frame in frames
        ]
        matches = sum(value >= minimum for value in ratios)
        confidence = max(ratios, default=0.0)
        return ValidationResult(
            passed=matches >= consensus,
            progress=min(1.0, matches / consensus),
            confidence=min(1.0, confidence / max(minimum, 0.001)),
            note=f"{quest.target_color}: {confidence:.0%}",
            reason="color_consensus",
        )
