from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast

import cv2
import httpx
import numpy as np
import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from app.api.main import create_app
from app.models.contracts import VisionOutcome
from app.models.supabase_gateway import GatewayUnavailable
from app.models.turn import ActiveTurn, CalibrationClaims, QuestConfig
from app.security.jwt_verifier import Principal
from app.security.rate_limit import RateLimitExceeded
from app.security.vision_control import VisionDisabled
from app.validators.base import Frame, ValidationResult


class FakeJwt:
    async def verify(self, token: str) -> Principal:
        return Principal(subject=f"owner:{token}")


class FakeDetector:
    def __init__(self) -> None:
        self.warm_calls = 0

    async def warm(self) -> None:
        self.warm_calls += 1


class FakeGateway:
    def __init__(self) -> None:
        self.warm_calls = 0

    async def warm(self) -> None:
        self.warm_calls += 1


def make_app() -> FastAPI:
    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=FakeDetector(),
        gateway=FakeGateway(),
    )
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
async def test_warmup_primes_model_and_supabase_connections() -> None:
    detector = FakeDetector()
    gateway = FakeGateway()
    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=detector,
        gateway=gateway,
    )
    app = create_app(cast(Any, services))

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/warmup",
            headers={"Authorization": "Bearer valid"},
        )

    assert response.status_code == 204
    assert detector.warm_calls == 1
    assert gateway.warm_calls == 1


@pytest.mark.asyncio
async def test_warmup_coalesces_repeated_requests_inside_the_cache_window() -> None:
    detector = FakeDetector()
    gateway = FakeGateway()
    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=detector,
        gateway=gateway,
    )
    app = create_app(cast(Any, services))

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        first = await client.post("/v1/warmup", headers={"Authorization": "Bearer one"})
        second = await client.post("/v1/warmup", headers={"Authorization": "Bearer two"})

    assert first.status_code == 204
    assert second.status_code == 204
    assert detector.warm_calls == 1
    assert gateway.warm_calls == 1


@pytest.mark.asyncio
async def test_warmup_maps_gpu_capacity_failure_to_retryable_service_error() -> None:
    class CapacityLimitedDetector:
        async def warm(self) -> None:
            raise RuntimeError("gpu_capacity_unavailable")

    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=CapacityLimitedDetector(),
        gateway=FakeGateway(),
    )
    app = create_app(cast(Any, services))

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/warmup",
            headers={"Authorization": "Bearer valid"},
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "VISION_UNAVAILABLE"


@pytest.mark.asyncio
async def test_warmup_rate_limit_runs_before_gpu_work() -> None:
    class RejectingLimiter:
        def check(self, subject: str) -> None:
            assert subject == "owner:valid"
            raise RateLimitExceeded

    detector = FakeDetector()
    gateway = FakeGateway()
    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=detector,
        gateway=gateway,
        warmup_limiter=RejectingLimiter(),
    )
    app = create_app(cast(Any, services))

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/warmup",
            headers={"Authorization": "Bearer valid"},
        )

    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "RATE_LIMITED"
    assert detector.warm_calls == 0
    assert gateway.warm_calls == 0


@pytest.mark.asyncio
async def test_distributed_quota_runs_before_gpu_work() -> None:
    class RejectingGuard:
        async def check(self, action: str, subject: str, ip: str, device: str) -> None:
            assert (action, subject, device) == ("warmup", "owner:valid", "device-0001")
            assert ip
            raise RateLimitExceeded

    detector = FakeDetector()
    gateway = FakeGateway()
    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=detector,
        gateway=gateway,
        abuse_guard=RejectingGuard(),
    )
    app = create_app(cast(Any, services))

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/warmup",
            headers={
                "Authorization": "Bearer valid",
                "X-Camera-Quest-Device": "device-0001",
            },
        )

    assert response.status_code == 429
    assert detector.warm_calls == 0
    assert gateway.warm_calls == 0


@pytest.mark.asyncio
async def test_remote_kill_switch_runs_before_gpu_work() -> None:
    class DisabledControl:
        async def ensure_enabled(self) -> None:
            raise VisionDisabled

    detector = FakeDetector()
    gateway = FakeGateway()
    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=detector,
        gateway=gateway,
        vision_control=DisabledControl(),
    )
    app = create_app(cast(Any, services))

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/warmup", headers={"Authorization": "Bearer valid"}
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "VISION_DISABLED"
    assert detector.warm_calls == 0
    assert gateway.warm_calls == 0


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


@pytest.mark.asyncio
async def test_calibration_rate_limit_runs_before_frame_decoding() -> None:
    class RejectingLimiter:
        def check(self, subject: str) -> None:
            assert subject == "owner:valid"
            raise RateLimitExceeded

    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=FakeDetector(),
        gateway=FakeGateway(),
        calibration_limiter=RejectingLimiter(),
    )
    app = create_app(cast(Any, services))
    files = [("frames", (f"{index}.jpg", b"not-a-jpeg", "image/jpeg")) for index in range(5)]

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/calibrate",
            headers={"Authorization": "Bearer valid"},
            files=files,
        )

    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "RATE_LIMITED"


@pytest.mark.asyncio
async def test_calibration_requires_a_one_time_server_ticket_before_frame_decoding() -> None:
    class TicketGateway(FakeGateway):
        calls = 0

        async def consume_vision_ticket(self, ticket: str, owner_id: str) -> bool:
            assert ticket == "20000000-0000-4000-8000-000000000001"
            assert owner_id == "owner:valid"
            self.calls += 1
            return False

    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    gateway = TicketGateway()
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=FakeDetector(),
        gateway=gateway,
    )
    app = create_app(cast(Any, services))
    files = [("frames", (f"{index}.jpg", b"not-a-jpeg", "image/jpeg")) for index in range(5)]

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/calibrate",
            headers={"Authorization": "Bearer valid"},
            data={"ticket": "20000000-0000-4000-8000-000000000001"},
            files=files,
        )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "CALIBRATION_TICKET_INVALID"
    assert gateway.calls == 1


@pytest.mark.asyncio
async def test_validate_maps_supabase_outage_to_retryable_service_error() -> None:
    class FakeSigner:
        def verify(self, token: str, subject: str) -> object:
            return object()

    class FakeRateLimiter:
        calls = 0

        def check(self, turn_id: str, sequence_no: int) -> None:
            del turn_id, sequence_no
            self.calls += 1

    class UnavailableGateway:
        async def get_active_turn(self, turn_id: str, owner_id: str) -> object:
            raise GatewayUnavailable("supabase_status_401")

    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    rate_limiter = FakeRateLimiter()
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=FakeDetector(),
        signer=FakeSigner(),
        rate_limiter=rate_limiter,
        gateway=UnavailableGateway(),
    )
    app = create_app(cast(Any, services))
    files = [("frames", (f"{index}.jpg", b"frame", "image/jpeg")) for index in range(5)]

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/validate",
            headers={"Authorization": "Bearer valid", "Origin": "http://localhost:3000"},
            data={
                "turnId": "10000000-0000-4000-8000-000000000001",
                "sequenceNo": "1",
                "calibrationToken": "signed-calibration-token",
            },
            files=files,
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "VISION_UNAVAILABLE"
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert rate_limiter.calls == 0


@pytest.mark.asyncio
async def test_validate_subject_rate_limit_runs_before_turn_lookup() -> None:
    class FakeSigner:
        def verify(self, token: str, subject: str) -> object:
            del token, subject
            return object()

    class RejectingLimiter:
        def check(self, subject: str) -> None:
            assert subject == "owner:valid"
            raise RateLimitExceeded

    class CountingGateway:
        calls = 0

        async def get_active_turn(self, turn_id: str, owner_id: str) -> object:
            del turn_id, owner_id
            self.calls += 1
            return object()

    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    gateway = CountingGateway()
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=FakeDetector(),
        signer=FakeSigner(),
        validation_limiter=RejectingLimiter(),
        gateway=gateway,
    )
    app = create_app(cast(Any, services))
    files = [("frames", (f"{index}.jpg", b"frame", "image/jpeg")) for index in range(5)]

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/validate",
            headers={"Authorization": "Bearer valid"},
            data={
                "turnId": "10000000-0000-4000-8000-000000000001",
                "sequenceNo": "1",
                "calibrationToken": "signed-calibration-token",
            },
            files=files,
        )

    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "RATE_LIMITED"
    assert gateway.calls == 0


@pytest.mark.asyncio
async def test_remote_kill_switch_aborts_an_active_turn_before_frame_decoding() -> None:
    class FakeSigner:
        def verify(self, token: str, subject: str) -> CalibrationClaims:
            del token
            return CalibrationClaims(sub=subject, exp=9_999_999_999)

    class UnusedTurnLimiter:
        calls = 0

        def check(self, turn_id: str, sequence_no: int) -> None:
            del turn_id, sequence_no
            self.calls += 1

    class ActiveGateway:
        aborted: tuple[str, str] | None = None

        async def get_active_turn(self, turn_id: str, owner_id: str) -> ActiveTurn:
            return ActiveTurn(
                id=turn_id,
                game_id="20000000-0000-4000-8000-000000000001",
                player_id="30000000-0000-4000-8000-000000000001",
                owner_id=owner_id,
                status="active",
                started_at=datetime.now(UTC),
                deadline_at=datetime.now(UTC) + timedelta(seconds=30),
                quest=QuestConfig(
                    id="40000000-0000-4000-8000-000000000001",
                    key="obj-cup",
                    kind="object",
                    target_class="cup",
                    validator_config={},
                ),
            )

        async def abort_turn(self, turn_id: str, reason: str) -> None:
            self.aborted = (turn_id, reason)

    class DisabledControl:
        async def ensure_enabled(self) -> None:
            raise VisionDisabled

    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    gateway = ActiveGateway()
    turn_limiter = UnusedTurnLimiter()
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=FakeDetector(),
        signer=FakeSigner(),
        rate_limiter=turn_limiter,
        gateway=gateway,
        vision_control=DisabledControl(),
    )
    app = create_app(cast(Any, services))
    files = [("frames", (f"{index}.jpg", b"not-a-jpeg", "image/jpeg")) for index in range(5)]

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/validate",
            headers={"Authorization": "Bearer valid"},
            data={
                "turnId": "10000000-0000-4000-8000-000000000001",
                "sequenceNo": "1",
                "calibrationToken": "signed-calibration-token",
            },
            files=files,
        )

    assert response.status_code == 200
    assert response.json()["decision"] == "system_error"
    assert gateway.aborted == (
        "10000000-0000-4000-8000-000000000001",
        "vision_disabled",
    )
    assert turn_limiter.calls == 0


@pytest.mark.asyncio
async def test_continue_verdict_does_not_depend_on_telemetry_write() -> None:
    class FakeSigner:
        def verify(self, token: str, subject: str) -> CalibrationClaims:
            del token
            return CalibrationClaims(sub=subject, exp=9_999_999_999)

    class FakeRateLimiter:
        def check(self, turn_id: str, sequence_no: int) -> None:
            del turn_id, sequence_no

    class ActiveGateway:
        abort_calls = 0

        async def get_active_turn(self, turn_id: str, owner_id: str) -> ActiveTurn:
            return ActiveTurn(
                id=turn_id,
                game_id="20000000-0000-4000-8000-000000000001",
                player_id="30000000-0000-4000-8000-000000000001",
                owner_id=owner_id,
                status="active",
                started_at=datetime.now(UTC),
                deadline_at=datetime.now(UTC) + timedelta(seconds=30),
                quest=QuestConfig(
                    id="40000000-0000-4000-8000-000000000001",
                    key="obj-cup",
                    kind="object",
                    target_class="cup",
                    validator_config={"consensus": 3},
                ),
            )

        async def abort_turn(self, turn_id: str, reason: str) -> None:
            del turn_id, reason
            self.abort_calls += 1

    class ContinueValidator:
        version = "test-validator"

        async def validate(
            self,
            frames: list[Frame],
            quest: QuestConfig,
            calibration: CalibrationClaims,
        ) -> ValidationResult:
            del frames, quest, calibration
            return ValidationResult(
                passed=False,
                progress=0.5,
                confidence=0.5,
                reason="object_consensus",
            )

    class FakeValidators:
        def for_kind(self, kind: str) -> ContinueValidator:
            del kind
            return ContinueValidator()

    class FailingAttemptSink:
        calls = 0

        async def submit(self, attempt: object) -> None:
            del attempt
            self.calls += 1
            raise GatewayUnavailable("telemetry_queue_unavailable")

    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    gateway = ActiveGateway()
    attempts = FailingAttemptSink()
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=FakeDetector(),
        signer=FakeSigner(),
        rate_limiter=FakeRateLimiter(),
        gateway=gateway,
        attempts=attempts,
        validators=FakeValidators(),
    )
    app = create_app(cast(Any, services))
    ok, encoded = cv2.imencode(".jpg", np.zeros((512, 512, 3), dtype=np.uint8))
    assert ok
    files = [
        ("frames", (f"{index}.jpg", encoded.tobytes(), "image/jpeg")) for index in range(5)
    ]

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/v1/validate",
            headers={"Authorization": "Bearer valid"},
            data={
                "turnId": "10000000-0000-4000-8000-000000000001",
                "sequenceNo": "1",
                "calibrationToken": "signed-calibration-token",
            },
            files=files,
        )

    assert response.status_code == 200
    assert response.json()["decision"] == "continue"
    assert attempts.calls == 1
    assert gateway.abort_calls == 0


class StreamSigner:
    def verify(self, token: str, subject: str) -> CalibrationClaims:
        del token
        return CalibrationClaims(sub=subject, exp=9_999_999_999)


class StreamRateLimiter:
    def check(self, turn_id: str, sequence_no: int) -> None:
        del turn_id, sequence_no


class StreamGateway:
    def __init__(self) -> None:
        self.lookup_calls = 0
        self.resolve_calls = 0

    async def get_active_turn(self, turn_id: str, owner_id: str) -> ActiveTurn:
        self.lookup_calls += 1
        return ActiveTurn(
            id=turn_id,
            game_id="20000000-0000-4000-8000-000000000001",
            player_id="30000000-0000-4000-8000-000000000001",
            owner_id=owner_id,
            status="active",
            started_at=datetime.now(UTC),
            deadline_at=datetime.now(UTC) + timedelta(seconds=30),
            quest=QuestConfig(
                id="40000000-0000-4000-8000-000000000001",
                key="smile",
                kind="smile",
                validator_config={"consensus": 4},
            ),
        )

    async def resolve_turn(
        self,
        turn_id: str,
        sequence_no: int,
        latency_ms: int,
        confidence: float,
        validator: str,
        model_version: str,
        validator_version: str,
        reason: str | None,
    ) -> VisionOutcome:
        del sequence_no, latency_ms, confidence, validator, model_version, validator_version, reason
        self.resolve_calls += 1
        return VisionOutcome(
            turn_id=turn_id,
            elapsed_ms=400,
            points=20,
            xp=20,
            total_score=20,
            total_xp=20,
            level=1,
            streak=1,
            unlocked_achievement_ids=[],
        )

    async def abort_turn(self, turn_id: str, reason: str) -> None:
        del turn_id, reason


class StreamAttempts:
    def __init__(self) -> None:
        self.calls = 0

    async def submit(self, attempt: object) -> None:
        del attempt
        self.calls += 1


class StreamValidator:
    version = "stream-test-v1"

    def __init__(self, pass_on_four: bool) -> None:
        self.pass_on_four = pass_on_four
        self.frame_counts: list[int] = []

    async def validate(
        self,
        frames: list[Frame],
        quest: QuestConfig,
        calibration: CalibrationClaims,
    ) -> ValidationResult:
        del quest, calibration
        self.frame_counts.append(len(frames))
        passed = self.pass_on_four and len(frames) >= 4
        return ValidationResult(
            passed=passed,
            progress=1 if passed else 0.5,
            confidence=1 if passed else 0.5,
            reason="object_consensus",
        )


class StreamValidators:
    def __init__(self, validator: StreamValidator) -> None:
        self.validator = validator

    def for_kind(self, kind: str) -> StreamValidator:
        assert kind == "smile"
        return self.validator


def make_stream_app(
    validator: StreamValidator,
) -> tuple[FastAPI, StreamGateway, StreamAttempts]:
    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="test-model",
        sentry_dsn=None,
        environment="test",
    )
    gateway = StreamGateway()
    attempts = StreamAttempts()
    services = SimpleNamespace(
        settings=settings,
        jwt=FakeJwt(),
        detector=FakeDetector(),
        signer=StreamSigner(),
        rate_limiter=StreamRateLimiter(),
        gateway=gateway,
        attempts=attempts,
        validators=StreamValidators(validator),
    )
    return create_app(cast(Any, services)), gateway, attempts


def stream_auth_message() -> dict[str, str]:
    return {
        "type": "authenticate",
        "accessToken": "valid",
        "turnId": "10000000-0000-4000-8000-000000000001",
        "calibrationToken": "signed-calibration-token",
        "deviceId": "test-device-0001",
    }


def jpeg_frame() -> bytes:
    ok, encoded = cv2.imencode(".jpg", np.zeros((512, 512, 3), dtype=np.uint8))
    assert ok
    return encoded.tobytes()


def test_stream_authenticates_and_loads_the_turn_only_once() -> None:
    validator = StreamValidator(pass_on_four=False)
    app, gateway, attempts = make_stream_app(validator)
    frame = jpeg_frame()

    with TestClient(app) as client:
        with client.websocket_connect(
            "/v1/stream",
            headers={"origin": "http://localhost:3000"},
        ) as websocket:
            websocket.send_json(stream_auth_message())
            assert websocket.receive_json() == {"type": "ready"}
            for sequence_no in (10, 11):
                websocket.send_json({"type": "batch", "sequenceNo": sequence_no})
                for _ in range(5):
                    websocket.send_bytes(frame)
                message = websocket.receive_json()
                assert message["type"] == "verdict"
                assert message["verdict"]["decision"] == "continue"

    assert gateway.lookup_calls == 1
    assert attempts.calls == 2
    assert validator.frame_counts == [4, 5, 4, 5]


def test_stream_can_pass_a_specialist_quest_after_four_frames() -> None:
    validator = StreamValidator(pass_on_four=True)
    app, gateway, _ = make_stream_app(validator)
    frame = jpeg_frame()

    with TestClient(app) as client:
        with client.websocket_connect(
            "/v1/stream",
            headers={"origin": "http://localhost:3000"},
        ) as websocket:
            websocket.send_json(stream_auth_message())
            assert websocket.receive_json() == {"type": "ready"}
            websocket.send_json({"type": "batch", "sequenceNo": 12})
            for _ in range(4):
                websocket.send_bytes(frame)
            message = websocket.receive_json()

    assert message["type"] == "verdict"
    assert message["verdict"]["decision"] == "pass"
    assert gateway.lookup_calls == 1
    assert gateway.resolve_calls == 1
    assert validator.frame_counts == [4]
