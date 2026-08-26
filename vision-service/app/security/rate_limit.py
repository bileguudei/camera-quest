from __future__ import annotations

import time
from collections import OrderedDict, deque
from collections.abc import Callable


class RateLimitExceeded(Exception):
    pass


class SequenceReplay(Exception):
    pass


Clock = Callable[[], float]


class SubjectRateLimiter:
    """Bounded container-local quota keyed by the authenticated subject."""

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        *,
        max_keys: int = 10_000,
        clock: Clock = time.monotonic,
    ) -> None:
        self._max_requests = max_requests
        self._window = window_seconds
        self._max_keys = max_keys
        self._clock = clock
        self._requests: dict[str, deque[float]] = {}
        self._last_seen: OrderedDict[str, float] = OrderedDict()

    def _make_room(self, key: str, now: float) -> None:
        stale_before = now - self._window
        while self._last_seen:
            candidate, last_seen = next(iter(self._last_seen.items()))
            if last_seen > stale_before:
                break
            self._last_seen.popitem(last=False)
            self._requests.pop(candidate, None)

        if key not in self._requests and len(self._requests) >= self._max_keys:
            oldest, _ = self._last_seen.popitem(last=False)
            self._requests.pop(oldest, None)

    def check(self, subject: str) -> None:
        now = self._clock()
        self._make_room(subject, now)
        queue = self._requests.setdefault(subject, deque())
        while queue and queue[0] <= now - self._window:
            queue.popleft()
        self._last_seen[subject] = now
        self._last_seen.move_to_end(subject)
        if len(queue) >= self._max_requests:
            raise RateLimitExceeded
        queue.append(now)


class TurnRateLimiter:
    """Fast replay guard with hard TTL and key-count memory bounds."""

    def __init__(
        self,
        max_requests: int = 5,
        window_seconds: float = 2.0,
        *,
        key_ttl_seconds: float = 600,
        max_keys: int = 10_000,
        clock: Clock = time.monotonic,
    ) -> None:
        self._max_requests = max_requests
        self._window = window_seconds
        self._key_ttl = key_ttl_seconds
        self._max_keys = max_keys
        self._clock = clock
        self._requests: dict[str, deque[float]] = {}
        self._sequences: dict[str, set[int]] = {}
        self._last_seen: OrderedDict[str, float] = OrderedDict()

    def _forget(self, turn_id: str) -> None:
        self._requests.pop(turn_id, None)
        self._sequences.pop(turn_id, None)
        self._last_seen.pop(turn_id, None)

    def _make_room(self, turn_id: str, now: float) -> None:
        stale_before = now - self._key_ttl
        while self._last_seen:
            candidate, last_seen = next(iter(self._last_seen.items()))
            if last_seen > stale_before:
                break
            self._forget(candidate)

        if turn_id not in self._requests and len(self._requests) >= self._max_keys:
            oldest = next(iter(self._last_seen))
            self._forget(oldest)

    def check(self, turn_id: str, sequence_no: int) -> None:
        now = self._clock()
        self._make_room(turn_id, now)
        sequences = self._sequences.setdefault(turn_id, set())
        if sequence_no in sequences:
            raise SequenceReplay

        queue = self._requests.setdefault(turn_id, deque())
        while queue and queue[0] <= now - self._window:
            queue.popleft()
        self._last_seen[turn_id] = now
        self._last_seen.move_to_end(turn_id)
        if len(queue) >= self._max_requests:
            raise RateLimitExceeded

        queue.append(now)
        sequences.add(sequence_no)
        if len(sequences) > 120:
            self._sequences[turn_id] = set(sorted(sequences)[-60:])
