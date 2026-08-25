from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.calibration import CalibrationService
from app.models.contracts import Detection
from app.models.gemini_fallback import GeminiObjectFallback
from app.models.mediapipe_analyzers import MediaPipeFaceAnalyzer
from app.models.supabase_gateway import SupabaseGateway
from app.models.telemetry import AttemptTelemetrySink, InlineAttemptTelemetrySink
from app.security.abuse_guard import DistributedVisionGuard
from app.security.calibration_token import CalibrationTokenSigner
from app.security.jwt_verifier import JwtVerifier
from app.security.rate_limit import SubjectRateLimiter, TurnRateLimiter
from app.security.vision_control import VisionControlGate
from app.settings import Settings
from app.validators.base import Frame
from app.validators.color import ColorValidator
from app.validators.object import ObjectValidator
from app.validators.registry import ValidatorRegistry
from app.validators.smile import SmileValidator


class ObjectDetectorService(Protocol):
    async def warm(self) -> None: ...

    async def detect_batch(self, frames: list[Frame]) -> list[list[Detection]]: ...


@dataclass(slots=True)
class Services:
    settings: Settings
    jwt: JwtVerifier
    signer: CalibrationTokenSigner
    rate_limiter: TurnRateLimiter
    warmup_limiter: SubjectRateLimiter
    calibration_limiter: SubjectRateLimiter
    validation_limiter: SubjectRateLimiter
    gateway: SupabaseGateway
    attempts: AttemptTelemetrySink
    calibration: CalibrationService
    validators: ValidatorRegistry
    detector: ObjectDetectorService
    abuse_guard: DistributedVisionGuard
    vision_control: VisionControlGate


def build_services(
    settings: Settings,
    detector: ObjectDetectorService,
    attempt_sink: AttemptTelemetrySink | None = None,
) -> Services:
    face = MediaPipeFaceAnalyzer(settings.face_landmarker_path)
    signer = CalibrationTokenSigner(settings.calibration_signing_secret.get_secret_value())
    fallback = None
    if settings.gemini_fallback_enabled and settings.gemini_api_key is not None:
        fallback = GeminiObjectFallback(
            settings.gemini_api_key.get_secret_value(),
            settings.gemini_model,
        )
    gateway = SupabaseGateway(
        str(settings.supabase_url),
        settings.supabase_secret_key.get_secret_value(),
    )
    abuse_secret = settings.calibration_signing_secret.get_secret_value().encode()
    return Services(
        settings=settings,
        jwt=JwtVerifier(settings.jwks_url, settings.jwt_issuer, settings.jwt_audience),
        signer=signer,
        rate_limiter=TurnRateLimiter(),
        # Anonymous accounts are authenticated identities. These quotas stop
        # one identity from repeatedly allocating GPU work; Modal's container
        # ceiling remains the outer capacity bound.
        warmup_limiter=SubjectRateLimiter(max_requests=3, window_seconds=60),
        calibration_limiter=SubjectRateLimiter(max_requests=6, window_seconds=60),
        validation_limiter=SubjectRateLimiter(max_requests=180, window_seconds=60),
        gateway=gateway,
        attempts=attempt_sink or InlineAttemptTelemetrySink(gateway),
        calibration=CalibrationService(detector, face, signer),
        validators=ValidatorRegistry(
            [
                ObjectValidator(detector, fallback),
                SmileValidator(face),
                ColorValidator(),
            ]
        ),
        detector=detector,
        abuse_guard=DistributedVisionGuard(gateway, abuse_secret),
        vision_control=VisionControlGate(gateway),
    )
