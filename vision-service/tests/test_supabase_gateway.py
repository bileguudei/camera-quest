from app.models.supabase_gateway import SupabaseGateway


def test_secret_key_is_not_sent_as_bearer_token() -> None:
    gateway = SupabaseGateway("https://example.supabase.co", "sb_secret_test")

    assert gateway._client.headers["apikey"] == "sb_secret_test"
    assert "authorization" not in gateway._client.headers
