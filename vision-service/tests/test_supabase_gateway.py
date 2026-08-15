import httpx
import pytest

from app.models.supabase_gateway import GatewayUnavailable, SupabaseGateway


def test_secret_key_is_not_sent_as_bearer_token() -> None:
    gateway = SupabaseGateway("https://example.supabase.co", "sb_secret_test")

    assert gateway._client.headers["apikey"] == "sb_secret_test"
    assert "authorization" not in gateway._client.headers


@pytest.mark.asyncio
async def test_warm_primes_the_postgrest_connection_with_a_bounded_query() -> None:
    seen_request: httpx.Request | None = None

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal seen_request
        seen_request = request
        return httpx.Response(200, json=[], request=request)

    gateway = SupabaseGateway("https://example.supabase.co", "sb_secret_test")
    await gateway._client.aclose()
    gateway._client = httpx.AsyncClient(
        base_url="https://example.supabase.co",
        transport=httpx.MockTransport(handler),
    )

    await gateway.warm()

    assert seen_request is not None
    assert seen_request.url.path == "/rest/v1/quests"
    assert seen_request.url.params["select"] == "id"
    assert seen_request.url.params["limit"] == "1"
    await gateway._client.aclose()


@pytest.mark.asyncio
async def test_authentication_failure_is_reported_as_gateway_unavailable() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "Invalid API key"}, request=request)

    gateway = SupabaseGateway("https://example.supabase.co", "disabled-key")
    await gateway._client.aclose()
    gateway._client = httpx.AsyncClient(
        base_url="https://example.supabase.co",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(GatewayUnavailable, match="supabase_status_401"):
        await gateway.get_active_turn("turn-id", "owner-id")

    await gateway._client.aclose()
