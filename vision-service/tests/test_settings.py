from app.settings import Settings


def test_blank_optional_secrets_disable_external_integrations() -> None:
    settings = Settings(
        supabase_url="https://camera-quest.example.supabase.co",
        supabase_secret_key="server-only-test-key",  # noqa: S106 - synthetic fixture
        calibration_signing_secret="x" * 32,
        gemini_api_key="",
        sentry_dsn="",
    )

    assert settings.gemini_api_key is None
    assert settings.sentry_dsn is None
