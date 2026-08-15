import pytest

from app.security.rate_limit import RateLimitExceeded, SequenceReplay, TurnRateLimiter


def test_sequence_replay_is_rejected() -> None:
    limiter = TurnRateLimiter()
    limiter.check("turn", 1)
    with pytest.raises(SequenceReplay):
        limiter.check("turn", 1)


def test_rate_limit_supports_fast_camera_cadence() -> None:
    limiter = TurnRateLimiter()
    for sequence in range(1, 6):
        limiter.check("turn", sequence)
    with pytest.raises(RateLimitExceeded):
        limiter.check("turn", 6)
