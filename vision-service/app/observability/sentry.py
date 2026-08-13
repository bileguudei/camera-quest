from __future__ import annotations

from typing import Any

import sentry_sdk
from sentry_sdk.types import Event

from app.settings import Settings


def _scrub_event(event: Event, hint: dict[str, Any]) -> Event | None:
    del hint
    request = event.get("request")
    if isinstance(request, dict):
        request.pop("data", None)
        request.pop("cookies", None)
        headers = request.get("headers")
        if isinstance(headers, dict):
            headers.pop("Authorization", None)
            headers.pop("authorization", None)
    event.pop("extra", None)
    return event


def configure_sentry(settings: Settings) -> None:
    if settings.sentry_dsn is None:
        return
    sentry_sdk.init(
        dsn=settings.sentry_dsn.get_secret_value(),
        environment=settings.environment,
        traces_sample_rate=0.1,
        send_default_pii=False,
        before_send=_scrub_event,
    )
