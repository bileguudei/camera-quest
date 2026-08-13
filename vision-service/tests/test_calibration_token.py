import time

import pytest

from app.models.turn import CalibrationClaims
from app.security.calibration_token import (
    CalibrationTokenSigner,
    InvalidCalibrationToken,
)


def test_calibration_token_is_bound_to_owner_and_expiry() -> None:
    signer = CalibrationTokenSigner("x" * 32)
    token = signer.sign(CalibrationClaims(sub="owner-a", exp=int(time.time()) + 60))
    assert signer.verify(token, "owner-a").sub == "owner-a"
    with pytest.raises(InvalidCalibrationToken):
        signer.verify(token, "owner-b")


def test_calibration_token_rejects_tampering() -> None:
    signer = CalibrationTokenSigner("x" * 32)
    token = signer.sign(CalibrationClaims(sub="owner-a", exp=int(time.time()) + 60))
    with pytest.raises(InvalidCalibrationToken):
        signer.verify(f"{token}tampered", "owner-a")
