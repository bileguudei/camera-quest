from types import SimpleNamespace
from typing import Any, cast

import httpx
import pytest
from fastapi import FastAPI

from app.api.main import create_app
from app.security.jwt_verifier import Principal


class FakeJwt:
    async def verify(self, token: str) -> Principal:
        return Principal(subject=f"owner:{token}")


class FakeDetector:
    async def warm(self) -> None:
        return None


def make_app() -> FastAPI:
    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    services = SimpleNamespace(settings=settings, jwt=FakeJwt(), detector=FakeDetector())
    return create_app(cast(Any, services))


@pytest.mark.asyncio
async def test_warmup_requires_authentication() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=make_app()), base_url="http://test"
    ) as client:
        response = await client.post("/v1/warmup")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_calibration_rejects_non_five_frame_payload() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=make_app()), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/calibrate",
            headers={"Authorization": "Bearer valid"},
            files=[("frames", ("one.jpg", b"not-a-jpeg", "image/jpeg"))],
        )
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_FRAME"


@pytest.mark.asyncio
async def test_body_limit_runs_before_frame_parsing() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=make_app()), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/calibrate",
            headers={
                "Authorization": "Bearer valid",
                "Content-Length": "1572865",
                "Content-Type": "application/octet-stream",
            },
            content=b"x",
        )
    assert response.status_code == 413
    assert response.json()["code"] == "INVALID_FRAME"
