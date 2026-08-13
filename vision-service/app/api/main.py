from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from contextlib import suppress
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Annotated

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.models.contracts import CalibrationResponse, HealthResponse, VisionVerdict
from app.models.frame import InvalidFrame, decode_frames
from app.models.supabase_gateway import TurnUnavailable
from app.observability.sentry import configure_sentry
from app.security.calibration_token import InvalidCalibrationToken
from app.security.jwt_verifier import InvalidAccessToken, Principal
from app.security.rate_limit import RateLimitExceeded, SequenceReplay

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
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    async def authenticate(authorization: str | None) -> Principal:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED"})
        try:
            return await services.jwt.verify(authorization[7:])
        except InvalidAccessToken as error:
            raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED"}) from error

    @app.exception_handler(InvalidFrame)
    async def invalid_frame_handler(request: Request, error: InvalidFrame) -> JSONResponse:
        del request
        return JSONResponse({"code": "INVALID_FRAME", "message": str(error)}, status_code=422)

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(model_version=services.settings.model_version)

    @app.post("/v1/warmup", status_code=204)
    async def warmup(authorization: Annotated[str | None, Header()] = None) -> Response:
        await authenticate(authorization)
        await services.detector.warm()
        return Response(status_code=204)

    @app.post("/v1/calibrate", response_model=CalibrationResponse)
    async def calibrate(
        frames: Annotated[list[UploadFile], File()],
        authorization: Annotated[str | None, Header()] = None,
    ) -> CalibrationResponse:
        principal = await authenticate(authorization)
        decoded = await decode_frames(frames)
        token, background = await services.calibration.calibrate(decoded, principal.subject)
        return CalibrationResponse(
            calibration_token=token,
            background_classes=background,
        )

    @app.post("/v1/validate", response_model=VisionVerdict)
    async def validate(
        turn_id: Annotated[str, Form(alias="turnId")],
        sequence_no: Annotated[int, Form(alias="sequenceNo", ge=1)],
        calibration_token: Annotated[str, Form(alias="calibrationToken", min_length=16)],
        frames: Annotated[list[UploadFile], File()],
        authorization: Annotated[str | None, Header()] = None,
    ) -> VisionVerdict:
        principal = await authenticate(authorization)
        try:
            calibration = services.signer.verify(calibration_token, principal.subject)
            services.rate_limiter.check(turn_id, sequence_no)
        except InvalidCalibrationToken as error:
            raise HTTPException(status_code=422, detail={"code": "INVALID_FRAME"}) from error
        except SequenceReplay as error:
            raise HTTPException(status_code=409, detail={"code": "SEQUENCE_REPLAY"}) from error
        except RateLimitExceeded as error:
            raise HTTPException(status_code=429, detail={"code": "RATE_LIMITED"}) from error

        try:
            turn = await services.gateway.get_active_turn(turn_id, principal.subject)
        except TurnUnavailable as error:
            raise HTTPException(status_code=409, detail={"code": "TURN_EXPIRED"}) from error
        if turn.deadline_at <= datetime.now(UTC):
            raise HTTPException(status_code=409, detail={"code": "TURN_EXPIRED"})

        decoded = await decode_frames(frames)
        validator = services.validators.for_kind(turn.quest.kind)
        started = time.perf_counter()
        try:
            result = await validator.validate(decoded, turn.quest, calibration)
            latency_ms = round((time.perf_counter() - started) * 1000)
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

            await services.gateway.record_attempt(
                turn.id,
                sequence_no,
                latency_ms,
                result.confidence,
                turn.quest.kind,
                "continue",
                result.reason,
            )
            return VisionVerdict(
                decision="continue",
                progress=result.progress,
                detections=result.detections,
                note=result.note,
            )
        except TurnUnavailable as error:
            raise HTTPException(status_code=409, detail={"code": "TURN_EXPIRED"}) from error
        except Exception:
            latency_ms = round((time.perf_counter() - started) * 1000)
            # Metadata-only recording makes system-error rate observable without frame retention.
            with suppress(Exception):
                await services.gateway.record_attempt(
                    turn.id,
                    sequence_no,
                    latency_ms,
                    0,
                    turn.quest.kind,
                    "system_error",
                    "validator_system_error",
                )
            with suppress(Exception):
                await services.gateway.abort_turn(turn.id, "validator_system_error")
            return VisionVerdict(
                decision="system_error",
                progress=0,
                detections=[],
                note="VISION_UNAVAILABLE",
            )

    return app
