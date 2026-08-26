import { describe, expect, it, vi } from "vitest";
import { flushIceCandidates, queueOrApplyIceCandidate } from "./webrtcIceQueue";

const candidate = (value: string): RTCIceCandidateInit => ({ candidate: value });

describe("WebRTC ICE ordering", () => {
  it("keeps candidates that arrive before the peer or remote description", async () => {
    const pending: RTCIceCandidateInit[] = [];
    const addIceCandidate = vi.fn().mockResolvedValue(undefined);

    await queueOrApplyIceCandidate(null, pending, candidate("early"));
    expect(pending).toEqual([candidate("early")]);

    const peer = {
      remoteDescription: null,
      addIceCandidate,
    } as unknown as RTCPeerConnection;
    await queueOrApplyIceCandidate(peer, pending, candidate("also-early"));
    expect(addIceCandidate).not.toHaveBeenCalled();
    expect(pending).toEqual([candidate("early"), candidate("also-early")]);
  });

  it("flushes queued candidates in order after the remote description is set", async () => {
    const pending = [candidate("first"), candidate("second")];
    const addIceCandidate = vi.fn().mockResolvedValue(undefined);
    const peer = {
      remoteDescription: { type: "offer", sdp: "remote" },
      addIceCandidate,
    } as unknown as RTCPeerConnection;

    await flushIceCandidates(peer, pending);

    expect(addIceCandidate.mock.calls).toEqual([[candidate("first")], [candidate("second")]]);
    expect(pending).toEqual([]);
  });

  it("applies a late candidate immediately", async () => {
    const pending: RTCIceCandidateInit[] = [];
    const addIceCandidate = vi.fn().mockResolvedValue(undefined);
    const peer = {
      remoteDescription: { type: "answer", sdp: "remote" },
      addIceCandidate,
    } as unknown as RTCPeerConnection;

    await queueOrApplyIceCandidate(peer, pending, candidate("late"));

    expect(addIceCandidate).toHaveBeenCalledWith(candidate("late"));
    expect(pending).toEqual([]);
  });
});
