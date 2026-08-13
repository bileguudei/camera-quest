from __future__ import annotations

import time
from collections import defaultdict, deque


class RateLimitExceeded(Exception):
    pass


class SequenceReplay(Exception):
    pass


class TurnRateLimiter:
    """Container-local fast rejection; the DB unique key is the global replay guard."""

    def __init__(self, max_requests: int = 3, window_seconds: float = 2.0) -> None:
        self._max_requests = max_requests
        self._window = window_seconds
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._sequences: dict[str, set[int]] = defaultdict(set)

    def check(self, turn_id: str, sequence_no: int) -> None:
        if sequence_no in self._sequences[turn_id]:
            raise SequenceReplay
        now = time.monotonic()
        queue = self._requests[turn_id]
        while queue and queue[0] <= now - self._window:
            queue.popleft()
        if len(queue) >= self._max_requests:
            raise RateLimitExceeded
        queue.append(now)
        self._sequences[turn_id].add(sequence_no)

        if len(self._sequences[turn_id]) > 120:
            self._sequences[turn_id] = set(sorted(self._sequences[turn_id])[-60:])
