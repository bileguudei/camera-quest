import httpx
import pytest

from app.models.supabase_gateway import GatewayUnavailable, SupabaseGateway, TurnUnavailable


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


def _turn_row(seat_owner: str) -> dict[str, object]:
    return {
        "id": "turn-id",
        "game_id": "game-id",
        "player_id": "player-id",
        "status": "active",
        "started_at": "2026-08-18T00:00:00+00:00",
        "deadline_at": "2026-08-18T00:00:30+00:00",
        "quest": {
            "id": "quest-id",
            "key": "obj-apple",
            "kind": "object",
            "target_class": "apple",
            "target_color": None,
            "validator_config": {},
        },
        "seat": {"owner_id": seat_owner},
    }


def _mock_gateway(handler: object) -> SupabaseGateway:
    gateway = SupabaseGateway("https://example.supabase.co", "sb_secret_test")
    gateway._client = httpx.AsyncClient(
        base_url="https://example.supabase.co",
        transport=httpx.MockTransport(handler),  # type: ignore[arg-type]
    )
    return gateway


@pytest.mark.asyncio
async def test_active_turn_is_authorized_against_the_seat_owner() -> None:
    seen_request: httpx.Request | None = None

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal seen_request
        seen_request = request
        return httpx.Response(200, json=[_turn_row("seat-owner")], request=request)

    gateway = _mock_gateway(handler)

    turn = await gateway.get_active_turn("turn-id", "seat-owner")

    assert turn.owner_id == "seat-owner"
    assert seen_request is not None
    assert "game_players!inner(owner_id)" in seen_request.url.params["select"]
    await gateway._client.aclose()


@pytest.mark.asyncio
async def test_another_member_cannot_validate_a_turn_it_does_not_sit_at() -> None:
    """The host of an online lobby must not be able to score someone else's turn."""

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[_turn_row("seat-owner")], request=request)

    gateway = _mock_gateway(handler)

    with pytest.raises(TurnUnavailable):
        await gateway.get_active_turn("turn-id", "host-who-is-not-the-seat")

    await gateway._client.aclose()
