type IcePeer = Pick<RTCPeerConnection, "remoteDescription" | "addIceCandidate">;

/**
 * Realtime delivery can beat SDP negotiation. Keep candidates until the peer
 * has a remote description instead of dropping them or relying on browser-
 * specific InvalidStateError behavior.
 */
export async function queueOrApplyIceCandidate(
  peer: IcePeer | null,
  pending: RTCIceCandidateInit[],
  candidate: RTCIceCandidateInit,
): Promise<void> {
  if (!peer?.remoteDescription) {
    pending.push(candidate);
    return;
  }
  await peer.addIceCandidate(candidate).catch(() => undefined);
}

export async function flushIceCandidates(
  peer: IcePeer,
  pending: RTCIceCandidateInit[],
): Promise<void> {
  if (!peer.remoteDescription) return;
  const queued = pending.splice(0);
  for (const candidate of queued) {
    await peer.addIceCandidate(candidate).catch(() => undefined);
  }
}
