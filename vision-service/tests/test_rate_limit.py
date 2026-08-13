import pytest

from app.security.rate_limit import SequenceReplay, TurnRateLimiter


def test_sequence_replay_is_rejected() -> None:
    limiter = TurnRateLimiter()
    limiter.check("turn", 1)
    with pytest.raises(SequenceReplay):
        limiter.check("turn", 1)
