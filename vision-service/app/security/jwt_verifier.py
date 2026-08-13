from __future__ import annotations

import asyncio
from dataclasses import dataclass

import jwt
from jwt import PyJWKClient


class InvalidAccessToken(Exception):
    pass


@dataclass(frozen=True, slots=True)
class Principal:
    subject: str


class JwtVerifier:
    def __init__(self, jwks_url: str, issuer: str, audience: str) -> None:
        self._client = PyJWKClient(jwks_url, cache_keys=True, lifespan=300)
        self._issuer = issuer
        self._audience = audience

    async def verify(self, token: str) -> Principal:
        try:
            signing_key = await asyncio.to_thread(self._client.get_signing_key_from_jwt, token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "sub", "aud"]},
            )
            subject = str(claims["sub"])
            if not subject:
                raise InvalidAccessToken
            return Principal(subject)
        except (jwt.PyJWTError, KeyError, ValueError) as error:
            raise InvalidAccessToken from error
