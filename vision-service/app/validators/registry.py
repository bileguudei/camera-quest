from __future__ import annotations

from app.validators.base import Validator


class ValidatorRegistry:
    def __init__(self, validators: list[Validator]) -> None:
        self._validators = {validator.kind: validator for validator in validators}
        if len(self._validators) != len(validators):
            raise ValueError("validator kinds must be unique")

    def for_kind(self, kind: str) -> Validator:
        try:
            return self._validators[kind]
        except KeyError as error:
            raise ValueError(f"unsupported validator kind: {kind}") from error
