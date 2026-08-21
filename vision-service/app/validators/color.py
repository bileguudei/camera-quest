from __future__ import annotations

from typing import Final

import cv2
import numpy as np

from app.models.turn import CalibrationClaims, QuestConfig
from app.validators.base import Frame, ValidationResult, Validator, consensus_is_settled

HueRange = tuple[tuple[int, int], ...]

HSV_RANGES: Final[dict[str, HueRange]] = {
    # Wider, non-overlapping bands tolerate mobile-camera white balance while
    # keeping one pixel from voting for two quest colors.
    "red": ((0, 14), (166, 179)),
    "yellow": ((15, 38),),
    "green": ((39, 84),),
    "blue": ((85, 145),),
}

DEFAULT_SATURATION: Final[dict[str, float]] = {
    "red": 0.36,
    "yellow": 0.30,
    "green": 0.30,
    "blue": 0.30,
}


def _color_area_ratios(
    frame: Frame,
    color: str,
    saturation: float,
    value: float,
) -> tuple[float, float]:
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
    # A real object forms a connected region. Opening removes JPEG/color speckle
    # and prevents many isolated matching pixels from adding up to a false pass.
    kernel = np.ones((5, 5), dtype=np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    total_ratio = float(np.count_nonzero(mask)) / float(mask.size)
    component_count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    largest_ratio = (
        float(stats[1:, cv2.CC_STAT_AREA].max()) / float(mask.size)
        if component_count > 1
        else 0.0
    )
    return total_ratio, largest_ratio


def color_ratio(
    frame: Frame,
    color: str,
    saturation: float | None = None,
    value: float = 0.18,
) -> float:
    floor = DEFAULT_SATURATION[color] if saturation is None else saturation
    return _color_area_ratios(frame, color, floor, value)[0]


class ColorValidator(Validator):
    kind = "color"
    version = "opencv-hsv-v2"

    async def validate(
        self,
        frames: list[Frame],
        quest: QuestConfig,
        calibration: CalibrationClaims,
    ) -> ValidationResult:
        if quest.target_color is None:
            raise ValueError("color quest is missing target_color")
        minimum = float(quest.validator_config.get("minArea", 0.025))
        minimum_region = float(quest.validator_config.get("minRegionArea", 0.015))
        saturation = float(
            quest.validator_config.get(
                "saturation", DEFAULT_SATURATION[quest.target_color]
            )
        )
        value = float(quest.validator_config.get("value", 0.18))
        consensus = int(quest.validator_config.get("consensus", 3))
        baseline = calibration.color_ratios.get(quest.target_color, 0.0)
        evidence_scores: list[float] = []
        largest_added = 0.0
        largest_region = 0.0
        matches = 0
        for frame in frames:
            total_ratio, region_ratio = _color_area_ratios(
                frame,
                quest.target_color,
                saturation,
                value,
            )
            added_ratio = max(0.0, total_ratio - baseline)
            evidence_scores.append(
                min(
                    1.0,
                    added_ratio / max(minimum, 0.001),
                    region_ratio / max(minimum_region, 0.001),
                )
            )
            largest_added = max(largest_added, added_ratio)
            largest_region = max(largest_region, region_ratio)
            matches += int(added_ratio >= minimum and region_ratio >= minimum_region)
            if consensus_is_settled(matches, len(evidence_scores), len(frames), consensus):
                break
        confidence = max(evidence_scores, default=0.0)
        return ValidationResult(
            passed=matches >= consensus,
            progress=min(1.0, matches / consensus),
            confidence=confidence,
            note=(
                f"{quest.target_color}: +{largest_added:.0%}, "
                f"region {largest_region:.0%}"
            ),
            reason="color_consensus",
        )
