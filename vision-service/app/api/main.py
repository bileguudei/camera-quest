from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from contextlib import suppress
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Annotated

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from starlette.datastructures import Headers
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp
from starlette.websockets import WebSocketDisconnect

from app.models.contracts import (
    CalibrationResponse,
    HealthResponse,
    StreamAuthMessage,
    StreamBatchMessage,
    VisionVerdict,
)
from app.models.frame import FRAME_COUNT, InvalidFrame, decode_frame_bytes, decode_frames
from app.models.supabase_gateway import GatewayUnavailable, TurnUnavailable
from app.models.telemetry import VisionAttemptTelemetry
from app.models.turn import ActiveTurn, CalibrationClaims
from app.observability.sentry import configure_sentry
from app.security.calibration_token import InvalidCalibrationToken
from app.security.jwt_verifier import InvalidAccessToken, Principal
from app.security.rate_limit import RateLimitExceeded, SequenceReplay, SubjectRateLimiter
from app.security.vision_control import VisionDisabled
from app.validators.base import Frame, ValidationResult, Validator

if TYPE_CHECKING:
    from app.services import Services

CallNext = Callable[[Request], Awaitable[Response]]


class BodyLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, maximum: int) -> None:
        super().__init__(app)
        self.maximum = maximum

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        try:
            content_length = int(request.headers.get("content-length", "0") or 0)
        except ValueError:
            return JSONResponse({"code": "INVALID_FRAME"}, status_code=413)
        if content_length > self.maximum:
            return JSONResponse({"code": "INVALID_FRAME"}, status_code=413)
        return await call_next(request)


def create_app(services: Services) -> FastAPI:
    configure_sentry(services.settings)
    app = FastAPI(title="Camera Quest Vision", version="1.0.0")
    app.add_middleware(BodyLimitMiddleware, maximum=services.settings.max_body_bytes)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=services.settings.cors_origins,
        allow_credentials=False,
        allow_methods=["POST", "GET"],
        allow_headers=["Authorization", "Content-Type", "X-Camera-Quest-Device"],
        max_age=600,
    )
    # Test doubles created before these fields existed keep working, while the
    # production Services instance supplies the same bounded policies.
    warmup_limiter = getattr(
        services,
        "warmup_limiter",
        SubjectRateLimiter(max_requests=3, window_seconds=60),
    )
    calibration_limiter = getattr(
        services,
        "calibration_limiter",
        SubjectRateLimiter(max_requests=6, window_seconds=60),
    )
    validation_limiter = getattr(
        services,
        "validation_limiter",
        SubjectRateLimiter(max_requests=180, window_seconds=60),
    )
    warmup_lock = asyncio.Lock()
    warm_until = 0.0

    def client_ip(headers: Headers, fallback: str | None) -> str:
        # Prefer ASGI's peer address so a caller cannot forge a forwarded-for
        # bucket. The header is only a fallback for runtimes without a client.
        forwarded = headers.get("x-forwarded-for")
        if fallback:
            return fallback
        return str(forwarded).split(",", 1)[0].strip() if forwarded else "unknown"

    async def distributed_guard(
        action: str,
        principal: Principal,
        ip: str,
        device_id: str | None,
    ) -> None:
        guard = getattr(services, "abuse_guard", None)
        if guard is not None:
            await guard.check(action, principal.subject, ip, device_id or "missing")

    async def ensure_vision_enabled() -> None:
        control = getattr(services, "vision_control", None)
        if control is not None:
            await control.ensure_enabled()

    async def authenticate(authorization: str | None) -> Principal:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED"})
        try:
            return await services.jwt.verify(authorization[7:])
        except InvalidAccessToken as error:
            raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED"}) from error

    async def run_validator(
        validator: Validator,
        frames: list[Frame],
        turn: ActiveTurn,
        calibration: CalibrationClaims,
    ) -> tuple[ValidationResult, int]:
        started = time.perf_counter()
        result = await validator.validate(frames, turn.quest, calibration)
        return result, round((time.perf_counter() - started) * 1000)

    async def finish_result(
        turn: ActiveTurn,
        sequence_no: int,
        validator: Validator,
        result: ValidationResult,
        latency_ms: int,
    ) -> VisionVerdict:
        if result.passed:
            outcome = await services.gateway.resolve_turn(
                turn.id,
                sequence_no,
                latency_ms,
                result.confidence,
                turn.quest.kind,
                services.settings.model_version,
                validator.version,
                result.reason,
            )
            return VisionVerdict(
                decision="pass",
                progress=1,
                detections=result.detections,
                note=result.note,
                outcome=outcome,
            )

        # Modal production submits only metadata to a durable background job;
        # a failed telemetry submission never delays or changes recognition.
        with suppress(Exception):
            await services.attempts.submit(
                VisionAttemptTelemetry(
                    turn_id=turn.id,
                    sequence_no=sequence_no,
                    latency_ms=latency_ms,
                    confidence=result.confidence,
                    validator=turn.quest.kind,
                    decision="continue",
                    reason=result.reason,
                )
            )
        return VisionVerdict(
            decision="continue",
            progress=result.progress,
            detections=result.detections,
            note=result.note,
        )

    async def system_error_verdict(
        turn: ActiveTurn,
        sequence_no: int,
        latency_ms: int,
    ) -> VisionVerdict:
        # Never claim a penalty-free system error unless the authoritative turn
        # was atomically aborted first.
        await services.gateway.abort_turn(turn.id, "validator_system_error")
        with suppress(Exception):
            await services.attempts.submit(
                VisionAttemptTelemetry(
                    turn_id=turn.id,
                    sequence_no=sequence_no,
                    latency_ms=latency_ms,
                    confidence=0,
                    validator=turn.quest.kind,
                    decision="system_error",
                    reason="validator_system_error",
                )
            )
        return VisionVerdict(
            decision="system_error",
            progress=0,
            detections=[],
            note="VISION_UNAVAILABLE",
        )

    async def evaluate_turn(
        turn: ActiveTurn,
        sequence_no: int,
        frames: list[Frame],
        calibration: CalibrationClaims,
        *,
        latency_offset_ms: int = 0,
    ) -> VisionVerdict:
        if turn.deadline_at <= datetime.now(UTC):
            raise TurnUnavailable
        validator = services.validators.for_kind(turn.quest.kind)
        started = time.perf_counter()
        try:
            result, latency_ms = await run_validator(validator, frames, turn, calibration)
        except Exception:
            latency_ms = latency_offset_ms + round((time.perf_counter() - started) * 1000)
            return await system_error_verdict(turn, sequence_no, latency_ms)
        return await finish_result(
            turn,
            sequence_no,
            validator,
            result,
            latency_offset_ms + latency_ms,
        )

    async def send_stream_error(
        websocket: WebSocket,
        code: str,
        *,
        close: bool,
    ) -> None:
        await websocket.send_json({"type": "error", "code": code})
        if close:
            await websocket.close(code=1008)

    @app.exception_handler(InvalidFrame)
    async def invalid_frame_handler(request: Request, error: InvalidFrame) -> JSONResponse:
        del request
        return JSONResponse({"code": "INVALID_FRAME", "message": str(error)}, status_code=422)

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(model_version=services.settings.model_version)

    @app.post("/v1/warmup", status_code=204)
    async def warmup(
        request: Request,
        authorization: Annotated[str | None, Header()] = None,
        device_id: Annotated[str | None, Header(alias="X-Camera-Quest-Device")] = None,
    ) -> Response:
        nonlocal warm_until
        principal = await authenticate(authorization)
        try:
            warmup_limiter.check(principal.subject)
            await ensure_vision_enabled()
            await distributed_guard(
                "warmup",
                principal,
                client_ip(request.headers, request.client.host if request.client else None),
                device_id,
            )
        except RateLimitExceeded as error:
            raise HTTPException(status_code=429, detail={"code": "RATE_LIMITED"}) from error
        except VisionDisabled as error:
            raise HTTPException(status_code=503, detail={"code": "VISION_DISABLED"}) from error
        except GatewayUnavailable as error:
            raise HTTPException(status_code=503, detail={"code": "VISION_UNAVAILABLE"}) from error

        # One warm operation per container per minute is enough. Concurrent
        # callers share the lock and reuse that result instead of multiplying
        # GPU allocations.
        try:
            async with warmup_lock:
                if time.monotonic() >= warm_until:
                    await asyncio.gather(services.detector.warm(), services.gateway.warm())
                    warm_until = time.monotonic() + 60
        except Exception as error:
            # Modal capacity and Supabase warm-up failures are both transient;
            # expose one retryable contract instead of leaking a generic 500.
            raise HTTPException(
                status_code=503,
                detail={"code": "VISION_UNAVAILABLE"},
            ) from error
        return Response(status_code=204)

    @app.post("/v1/calibrate", response_model=CalibrationResponse)
    async def calibrate(
        request: Request,
        frames: Annotated[list[UploadFile], File()],
        ticket: Annotated[str | None, Form()] = None,
        authorization: Annotated[str | None, Header()] = None,
        device_id: Annotated[str | None, Header(alias="X-Camera-Quest-Device")] = None,
    ) -> CalibrationResponse:
        principal = await authenticate(authorization)
        try:
            calibration_limiter.check(principal.subject)
            await ensure_vision_enabled()
            await distributed_guard(
                "calibrate",
                principal,
                client_ip(request.headers, request.client.host if request.client else None),
                device_id,
            )
        except RateLimitExceeded as error:
            raise HTTPException(status_code=429, detail={"code": "RATE_LIMITED"}) from error
        except VisionDisabled as error:
            raise HTTPException(status_code=503, detail={"code": "VISION_DISABLED"}) from error
        except GatewayUnavailable as error:
            raise HTTPException(status_code=503, detail={"code": "VISION_UNAVAILABLE"}) from error
        consume_ticket = getattr(services.gateway, "consume_vision_ticket", None)
        try:
            if consume_ticket is not None and (
                ticket is None or not await consume_ticket(ticket, principal.subject)
            ):
                raise HTTPException(
                    status_code=403,
                    detail={"code": "CALIBRATION_TICKET_INVALID"},
                )
        except GatewayUnavailable as error:
            raise HTTPException(status_code=503, detail={"code": "VISION_UNAVAILABLE"}) from error
        decoded = await decode_frames(frames)
        token, background = await services.calibration.calibrate(decoded, principal.subject)
        return CalibrationResponse(
            calibration_token=token,
            background_classes=background,
        )

    @app.post("/v1/validate", response_model=VisionVerdict)
    async def validate(
        request: Request,
        turn_id: Annotated[str, Form(alias="turnId")],
        sequence_no: Annotated[int, Form(alias="sequenceNo", ge=1)],
        calibration_token: Annotated[str, Form(alias="calibrationToken", min_length=16)],
        frames: Annotated[list[UploadFile], File()],
        authorization: Annotated[str | None, Header()] = None,
        device_id: Annotated[str | None, Header(alias="X-Camera-Quest-Device")] = None,
    ) -> VisionVerdict:
        principal = await authenticate(authorization)
        try:
            calibration = services.signer.verify(calibration_token, principal.subject)
        except InvalidCalibrationToken as error:
            raise HTTPException(status_code=422, detail={"code": "INVALID_FRAME"}) from error

        try:
            validation_limiter.check(principal.subject)
            await distributed_guard(
                "validate",
                principal,
                client_ip(request.headers, request.client.host if request.client else None),
                device_id,
            )
        except RateLimitExceeded as error:
            raise HTTPException(status_code=429, detail={"code": "RATE_LIMITED"}) from error
        except GatewayUnavailable as error:
            raise HTTPException(status_code=503, detail={"code": "VISION_UNAVAILABLE"}) from error

        # Authorize the turn before attacker-controlled ids reach the in-memory
        # replay map or any frame decoding/model work.
        try:
            turn = await services.gateway.get_active_turn(turn_id, principal.subject)
        except TurnUnavailable as error:
            raise HTTPException(status_code=409, detail={"code": "TURN_EXPIRED"}) from error
        except GatewayUnavailable as error:
            raise HTTPException(status_code=503, detail={"code": "VISION_UNAVAILABLE"}) from error

        try:
            await ensure_vision_enabled()
        except VisionDisabled:
            try:
                await services.gateway.abort_turn(turn.id, "vision_disabled")
            except GatewayUnavailable as error:
                raise HTTPException(
                    status_code=503,
                    detail={"code": "VISION_UNAVAILABLE"},
                ) from error
            return VisionVerdict(
                decision="system_error",
                progress=0,
                detections=[],
                note="VISION_DISABLED",
            )
        except GatewayUnavailable as error:
            raise HTTPException(status_code=503, detail={"code": "VISION_UNAVAILABLE"}) from error

        try:
            services.rate_limiter.check(turn.id, sequence_no)
        except SequenceReplay as error:
            raise HTTPException(status_code=409, detail={"code": "SEQUENCE_REPLAY"}) from error
        except RateLimitExceeded as error:
            raise HTTPException(status_code=429, detail={"code": "RATE_LIMITED"}) from error

        try:
            decoded = await decode_frames(frames)
            return await evaluate_turn(turn, sequence_no, decoded, calibration)
        except TurnUnavailable as error:
            raise HTTPException(status_code=409, detail={"code": "TURN_EXPIRED"}) from error
        except GatewayUnavailable as error:
            raise HTTPException(status_code=503, detail={"code": "VISION_UNAVAILABLE"}) from error

    @app.websocket("/v1/stream")
    async def stream(websocket: WebSocket) -> None:
        origin = websocket.headers.get("origin")
        if origin not in services.settings.cors_origins:
            await websocket.close(code=1008)
            return
        await websocket.accept()

        try:
            auth = StreamAuthMessage.model_validate_json(
                await asyncio.wait_for(websocket.receive_text(), timeout=5)
            )
            principal = await services.jwt.verify(auth.access_token)
            calibration = services.signer.verify(auth.calibration_token, principal.subject)
            await distributed_guard(
                "stream",
                principal,
                client_ip(websocket.headers, websocket.client.host if websocket.client else None),
                auth.device_id,
            )
            turn = await services.gateway.get_active_turn(auth.turn_id, principal.subject)
        except (ValidationError, InvalidCalibrationToken):
            await send_stream_error(websocket, "INVALID_FRAME", close=True)
            return
        except InvalidAccessToken:
            await send_stream_error(websocket, "UNAUTHORIZED", close=True)
            return
        except TurnUnavailable:
            await send_stream_error(websocket, "TURN_EXPIRED", close=True)
            return
        except GatewayUnavailable:
            await send_stream_error(websocket, "VISION_UNAVAILABLE", close=True)
            return
        except RateLimitExceeded:
            await send_stream_error(websocket, "RATE_LIMITED", close=True)
            return
        except (TimeoutError, WebSocketDisconnect):
            with suppress(Exception):
                await websocket.close(code=1008)
            return

        await websocket.send_json({"type": "ready"})
        validator = services.validators.for_kind(turn.quest.kind)
        consensus = int(turn.quest.validator_config.get("consensus", 5))
        early_frame_count = consensus if turn.quest.kind != "object" and 3 <= consensus < 5 else 0

        try:
            while True:
                try:
                    batch = StreamBatchMessage.model_validate_json(
                        await asyncio.wait_for(websocket.receive_text(), timeout=5)
                    )
                    services.rate_limiter.check(turn.id, batch.sequence_no)
                    await distributed_guard(
                        "validate",
                        principal,
                        client_ip(
                            websocket.headers,
                            websocket.client.host if websocket.client else None,
                        ),
                        auth.device_id,
                    )
                except ValidationError:
                    await send_stream_error(websocket, "INVALID_FRAME", close=True)
                    return
                except SequenceReplay:
                    await send_stream_error(websocket, "SEQUENCE_REPLAY", close=True)
                    return
                except RateLimitExceeded:
                    await send_stream_error(websocket, "RATE_LIMITED", close=True)
                    return
                except GatewayUnavailable:
                    await send_stream_error(websocket, "VISION_UNAVAILABLE", close=True)
                    return

                try:
                    await ensure_vision_enabled()
                except VisionDisabled:
                    try:
                        await services.gateway.abort_turn(turn.id, "vision_disabled")
                    except GatewayUnavailable:
                        await send_stream_error(websocket, "VISION_UNAVAILABLE", close=True)
                        return
                    await websocket.send_json(
                        {
                            "type": "verdict",
                            "verdict": VisionVerdict(
                                decision="system_error",
                                progress=0,
                                detections=[],
                                note="VISION_DISABLED",
                            ).model_dump(mode="json", by_alias=True),
                        }
                    )
                    await websocket.close(code=1011)
                    return
                except GatewayUnavailable:
                    await send_stream_error(websocket, "VISION_UNAVAILABLE", close=True)
                    return

                if turn.deadline_at <= datetime.now(UTC):
                    await send_stream_error(websocket, "TURN_EXPIRED", close=True)
                    return

                frames: list[Frame] = []
                invalid_frame = False
                total_bytes = 0
                early_latency_ms = 0
                for frame_index in range(FRAME_COUNT):
                    raw = await asyncio.wait_for(websocket.receive_bytes(), timeout=3)
                    total_bytes += len(raw)
                    try:
                        frames.append(decode_frame_bytes(raw))
                    except InvalidFrame:
                        invalid_frame = True

                    if (
                        early_frame_count
                        and frame_index + 1 == early_frame_count
                        and not invalid_frame
                    ):
                        started = time.perf_counter()
                        try:
                            early_result, early_latency_ms = await run_validator(
                                validator,
                                frames,
                                turn,
                                calibration,
                            )
                        except Exception:
                            latency_ms = round((time.perf_counter() - started) * 1000)
                            try:
                                verdict = await system_error_verdict(
                                    turn,
                                    batch.sequence_no,
                                    latency_ms,
                                )
                            except TurnUnavailable:
                                await send_stream_error(websocket, "TURN_EXPIRED", close=True)
                                return
                            except GatewayUnavailable:
                                await send_stream_error(
                                    websocket,
                                    "VISION_UNAVAILABLE",
                                    close=True,
                                )
                                return
                            await websocket.send_json(
                                {
                                    "type": "verdict",
                                    "verdict": verdict.model_dump(mode="json", by_alias=True),
                                }
                            )
                            await websocket.close(code=1011)
                            return
                        if early_result.passed:
                            try:
                                verdict = await finish_result(
                                    turn,
                                    batch.sequence_no,
                                    validator,
                                    early_result,
                                    early_latency_ms,
                                )
                            except TurnUnavailable:
                                await send_stream_error(websocket, "TURN_EXPIRED", close=True)
                                return
                            except GatewayUnavailable:
                                await send_stream_error(
                                    websocket,
                                    "VISION_UNAVAILABLE",
                                    close=True,
                                )
                                return
                            await websocket.send_json(
                                {
                                    "type": "verdict",
                                    "verdict": verdict.model_dump(mode="json", by_alias=True),
                                }
                            )
                            await websocket.close(code=1000)
                            return

                if invalid_frame or total_bytes > services.settings.max_body_bytes:
                    await send_stream_error(websocket, "INVALID_FRAME", close=False)
                    continue

                try:
                    verdict = await evaluate_turn(
                        turn,
                        batch.sequence_no,
                        frames,
                        calibration,
                        latency_offset_ms=early_latency_ms,
                    )
                except TurnUnavailable:
                    await send_stream_error(websocket, "TURN_EXPIRED", close=True)
                    return
                except GatewayUnavailable:
                    await send_stream_error(websocket, "VISION_UNAVAILABLE", close=True)
                    return
                await websocket.send_json(
                    {
                        "type": "verdict",
                        "verdict": verdict.model_dump(mode="json", by_alias=True),
                    }
                )
                if verdict.decision != "continue":
                    await websocket.close(code=1000)
                    return
        except WebSocketDisconnect:
            return
        except TimeoutError:
            with suppress(Exception):
                await send_stream_error(websocket, "VISION_UNAVAILABLE", close=True)

    return app
