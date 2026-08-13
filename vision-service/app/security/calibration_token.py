from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import time

from pydantic import ValidationError

from app.models.turn import CalibrationClaims


class InvalidCalibrationToken(Exception):
    pass


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


class CalibrationTokenSigner:
    def __init__(self, secret: str) -> None:
        self._secret = secret.encode()

    def sign(self, claims: CalibrationClaims) -> str:
        payload = _encode(claims.model_dump_json().encode())
        signature = _encode(hmac.digest(self._secret, payload.encode(), hashlib.sha256))
        return f"{payload}.{signature}"

    def verify(self, token: str, subject: str) -> CalibrationClaims:
        try:
            payload, signature = token.split(".", 1)
            expected = _encode(hmac.digest(self._secret, payload.encode(), hashlib.sha256))
            if not hmac.compare_digest(signature, expected):
                raise InvalidCalibrationToken
            claims = CalibrationClaims.model_validate_json(_decode(payload))
            if claims.sub != subject or claims.exp < int(time.time()):
                raise InvalidCalibrationToken
            return claims
        except (ValueError, ValidationError, UnicodeDecodeError, binascii.Error) as error:
            raise InvalidCalibrationToken from error
