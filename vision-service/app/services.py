from __future__ import annotations

from dataclasses import dataclass

from app.calibration import CalibrationService
from app.models.gemini_fallback import GeminiObjectFallback
from app.models.mediapipe_analyzers import MediaPipeFaceAnalyzer, MediaPipeHandAnalyzer
from app.models.remote_detector import ModalObjectDetector, RemoteWorker
from app.models.supabase_gateway import SupabaseGateway
from app.security.calibration_token import CalibrationTokenSigner
from app.security.jwt_verifier import JwtVerifier
from app.security.rate_limit import TurnRateLimiter
from app.settings import Settings
from app.validators.color import ColorValidator
from app.validators.fingers import FingerValidator
from app.validators.object import ObjectValidator
from app.validators.registry import ValidatorRegistry
from app.validators.smile import SmileValidator


@dataclass(slots=True)
class Services:
    settings: Settings
    jwt: JwtVerifier
    signer: CalibrationTokenSigner
    rate_limiter: TurnRateLimiter
    gateway: SupabaseGateway
    calibration: CalibrationService
    validators: ValidatorRegistry
    detector: ModalObjectDetector


def build_services(settings: Settings, worker: RemoteWorker) -> Services:
    detector = ModalObjectDetector(worker)
    hands = MediaPipeHandAnalyzer()
    face = MediaPipeFaceAnalyzer(settings.face_landmarker_path)
    signer = CalibrationTokenSigner(settings.calibration_signing_secret.get_secret_value())
    fallback = None
    if settings.gemini_fallback_enabled and settings.gemini_api_key is not None:
        fallback = GeminiObjectFallback(
            settings.gemini_api_key.get_secret_value(),
            settings.gemini_model,
        )
    return Services(
        settings=settings,
        jwt=JwtVerifier(settings.jwks_url, settings.jwt_issuer, settings.jwt_audience),
        signer=signer,
        rate_limiter=TurnRateLimiter(),
        gateway=SupabaseGateway(
            str(settings.supabase_url),
            settings.supabase_secret_key.get_secret_value(),
        ),
        calibration=CalibrationService(detector, hands, face, signer),
        validators=ValidatorRegistry(
            [
                ObjectValidator(detector, fallback),
                FingerValidator(hands),
                SmileValidator(face),
                ColorValidator(),
            ]
        ),
        detector=detector,
    )
