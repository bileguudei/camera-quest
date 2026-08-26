import pytest

from app.security.rate_limit import (
    RateLimitExceeded,
    SequenceReplay,
    SubjectRateLimiter,
    TurnRateLimiter,
)


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


def test_subject_limit_is_independent_and_resets_after_the_window() -> None:
    now = [0.0]
    limiter = SubjectRateLimiter(max_requests=2, window_seconds=60, clock=lambda: now[0])

    limiter.check("owner-a")
    limiter.check("owner-a")
    with pytest.raises(RateLimitExceeded):
        limiter.check("owner-a")
    limiter.check("owner-b")

    now[0] = 61
    limiter.check("owner-a")


def test_turn_limiter_forgets_inactive_attacker_chosen_keys() -> None:
    now = [0.0]
    limiter = TurnRateLimiter(
        key_ttl_seconds=5,
        max_keys=2,
        clock=lambda: now[0],
    )
    limiter.check("turn-a", 1)

    now[0] = 6
    limiter.check("turn-b", 1)
    # The old sequence is accepted because the entire inactive turn key was
    # evicted, rather than living for the lifetime of the GPU container.
    limiter.check("turn-a", 1)


def test_turn_limiter_caps_the_number_of_tracked_keys() -> None:
    now = [0.0]
    limiter = TurnRateLimiter(max_keys=2, clock=lambda: now[0])
    limiter.check("turn-a", 1)
    now[0] = 1
    limiter.check("turn-b", 1)
    now[0] = 2
    limiter.check("turn-c", 1)

    # The least recently seen key was evicted to preserve a hard memory bound.
    limiter.check("turn-a", 1)
