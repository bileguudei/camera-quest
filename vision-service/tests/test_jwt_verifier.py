from __future__ import annotations

import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.security.jwt_verifier import InvalidAccessToken, JwtVerifier


@pytest.mark.asyncio
async def test_jwt_verifies_issuer_audience_and_subject() -> None:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = jwt.encode(
        {
            "sub": "owner-1",
            "aud": "authenticated",
            "iss": "https://project.supabase.co/auth/v1",
            "exp": int(time.time()) + 60,
        },
        private,
        algorithm="RS256",
        headers={"kid": "test"},
    )
    verifier = JwtVerifier(
        "https://project.supabase.co/auth/v1/.well-known/jwks.json",
        "https://project.supabase.co/auth/v1",
        "authenticated",
    )
    verifier._client = SimpleNamespace(  # type: ignore[assignment]
        get_signing_key_from_jwt=lambda _: SimpleNamespace(key=private.public_key())
    )
    assert (await verifier.verify(token)).subject == "owner-1"

    with pytest.raises(InvalidAccessToken):
        wrong = JwtVerifier(
            "https://project.supabase.co/auth/v1/.well-known/jwks.json",
            "https://wrong.example/auth/v1",
            "authenticated",
        )
        wrong._client = verifier._client
        await wrong.verify(token)
