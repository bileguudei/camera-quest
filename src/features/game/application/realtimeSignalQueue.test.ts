import { describe, expect, it } from "vitest";
import { RealtimeSignalQueue, WatcherHeartbeatRegistry } from "./realtimeSignalQueue";

describe("Realtime signaling reliability", () => {
  it("flushes offer, early ICE and answer in their original order", () => {
    const queue = new RealtimeSignalQueue();
    queue.push({ kind: "offer", from: "publisher", to: "watcher", sdp: "offer" });
    queue.push({
      kind: "ice",
      from: "publisher",
      to: "watcher",
      candidate: {
        candidate: "early",
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: null,
      },
    });
    queue.push({ kind: "answer", from: "watcher", to: "publisher", sdp: "answer" });

    expect(queue.drain().map((signal) => signal.kind)).toEqual(["offer", "ice", "answer"]);
    expect(queue.drain()).toEqual([]);
  });

  it("bounds attacker-controlled pre-subscription messages", () => {
    const queue = new RealtimeSignalQueue(2);
    queue.push({ kind: "watch", from: "watcher-1" });
    queue.push({ kind: "watch", from: "watcher-2" });
    queue.push({ kind: "watch", from: "watcher-3" });
    expect(queue.drain().map((signal) => signal.from)).toEqual(["watcher-2", "watcher-3"]);
  });

  it("expires only watchers whose heartbeat stopped", () => {
    const registry = new WatcherHeartbeatRegistry();
    registry.touch("stale", 1_000);
    registry.touch("fresh", 6_000);
    expect(registry.expire(5_000)).toEqual(["stale"]);
    expect(registry.ids()).toEqual(["fresh"]);
  });
});
