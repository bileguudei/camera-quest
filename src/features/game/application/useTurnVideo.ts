"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getGameRepository } from "../infrastructure/createGameRepository";
import type { TurnChannel, TurnChannelHandlers } from "../infrastructure/gameRepository";
import type { TurnPreviewFrame, TurnSignal } from "../domain/types";
import { flushIceCandidates, queueOrApplyIceCandidate } from "./webrtcIceQueue";
import { WatcherHeartbeatRegistry } from "./realtimeSignalQueue";

/**
 * Public STUN only. A direct peer connection costs nothing, and the phones that
 * cannot reach each other through NAT keep the JPEG preview instead of forcing
 * a paid relay into the project.
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
];

/**
 * The source camera is requested at 720p. Scaling by two produces a readable
 * 640x360 spectator stream, while the bitrate/framerate caps keep the five-peer
 * mesh below a typical mobile uplink budget.
 */
export const TURN_VIDEO_ENCODING = {
  maxBitrate: 500_000,
  maxFramerate: 20,
  scaleResolutionDownBy: 2,
} satisfies RTCRtpEncodingParameters;
/** A watcher re-announces itself so a publisher that started later still sees it. */
const WATCH_PING_MS = 2_000;
const WATCH_EXPIRE_MS = 6_500;
/** Nothing negotiated by then: keep showing frames rather than a black box. */
const CONNECT_TIMEOUT_MS = 6_000;

const newClientId = () =>
  typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `peer-${Date.now()}`;

/** One channel per game per tab, shared by the frame and the video paths. */
function useTurnChannel(gameId: string | null, handlers: TurnChannelHandlers): TurnChannel | null {
  const [channel, setChannel] = useState<TurnChannel | null>(null);
  const latest = useRef(handlers);

  useEffect(() => {
    latest.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!gameId) return;
    const opened = getGameRepository().joinTurnChannel(gameId, {
      onFrame: (frame) => latest.current.onFrame?.(frame),
      onSignal: (signal) => latest.current.onSignal?.(signal),
    });
    setChannel(opened);
    return () => {
      setChannel(null);
      opened.close();
    };
  }, [gameId]);

  return channel;
}

interface PublisherOptions {
  stream: MediaStream | null;
  gameId: string | null;
  enabled: boolean;
  onFrameNeeded: (needed: boolean) => void;
}

/**
 * Sends the playing phone's camera to every watcher as a real WebRTC video
 * track. The publisher is always the offerer — it is the only side with media —
 * so there is no glare to resolve and no negotiation race to get wrong.
 */
export function useTurnVideoPublisher({
  stream,
  gameId,
  enabled,
  onFrameNeeded,
}: PublisherOptions): { channel: TurnChannel | null; watchersOnVideo: number } {
  const clientId = useMemo(() => newClientId(), []);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const viaVideo = useRef(new Set<string>());
  const watchers = useRef(new WatcherHeartbeatRegistry());
  const [watchersOnVideo, setWatchersOnVideo] = useState(0);
  const channelRef = useRef<TurnChannel | null>(null);
  const streamRef = useRef(stream);
  const needFrames = useRef(onFrameNeeded);

  useEffect(() => {
    streamRef.current = stream;
    needFrames.current = onFrameNeeded;
  }, [onFrameNeeded, stream]);

  const syncTransport = useCallback(() => {
    setWatchersOnVideo(viaVideo.current.size);
    // Frames stay on while anyone is still watching over the fallback path.
    const watcherIds = watchers.current.ids();
    const stragglers = watcherIds.some((peer) => !viaVideo.current.has(peer));
    needFrames.current(watcherIds.length === 0 || stragglers);
  }, []);

  const connect = useCallback(
    async (watcher: string) => {
      const media = streamRef.current;
      const channel = channelRef.current;
      if (!media || !channel || peers.current.has(watcher)) return;

      const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peers.current.set(watcher, peer);
      if (!pendingIce.current.has(watcher)) pendingIce.current.set(watcher, []);

      for (const track of media.getVideoTracks()) {
        // Camera Quest contains small objects and recognition boxes, so browsers
        // should preserve spatial detail before frame rate when bandwidth dips.
        track.contentHint = "detail";
        const sender = peer.addTrack(track, media);
        const parameters = sender.getParameters();
        parameters.encodings = [{ ...TURN_VIDEO_ENCODING }];
        parameters.degradationPreference = "maintain-resolution";
        // A mesh of five watchers must not saturate the player's uplink and
        // starve the frames that actually decide the score.
        await sender.setParameters(parameters).catch(() => undefined);
      }

      peer.onicecandidate = (event) => {
        if (!event.candidate) return;
        channel.publishSignal({
          kind: "ice",
          from: clientId,
          to: watcher,
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            usernameFragment: event.candidate.usernameFragment ?? null,
          },
        });
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" || peer.connectionState === "closed") {
          peers.current.delete(watcher);
          pendingIce.current.delete(watcher);
          viaVideo.current.delete(watcher);
          peer.close();
          syncTransport();
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      channel.publishSignal({ kind: "offer", from: clientId, to: watcher, sdp: offer.sdp });
    },
    [clientId, syncTransport],
  );

  const handleSignal = useCallback(
    (signal: TurnSignal) => {
      if (!enabled) return;
      if (signal.kind === "watch") {
        watchers.current.touch(signal.from);
        syncTransport();
        void connect(signal.from);
        return;
      }
      if (signal.to !== clientId) return;
      const peer = peers.current.get(signal.from);

      if (signal.kind === "answer" && signal.sdp) {
        if (!peer) return;
        void (async () => {
          await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
          await flushIceCandidates(peer, pendingIce.current.get(signal.from) ?? []);
        })().catch(() => undefined);
      } else if (signal.kind === "ice" && signal.candidate) {
        const pending = pendingIce.current.get(signal.from) ?? [];
        pendingIce.current.set(signal.from, pending);
        void queueOrApplyIceCandidate(peer ?? null, pending, signal.candidate);
      } else if (signal.kind === "transport") {
        if (signal.transport === "webrtc") viaVideo.current.add(signal.from);
        else viaVideo.current.delete(signal.from);
        syncTransport();
      }
    },
    [clientId, connect, enabled, syncTransport],
  );

  const channel = useTurnChannel(enabled ? gameId : null, { onSignal: handleSignal });

  useEffect(() => {
    channelRef.current = channel;
  }, [channel]);

  useEffect(() => {
    if (!enabled) return;
    const open = peers.current;
    const connected = viaVideo.current;
    const seen = watchers.current;
    const queuedCandidates = pendingIce.current;
    return () => {
      open.forEach((peer) => peer.close());
      open.clear();
      connected.clear();
      seen.clear();
      queuedCandidates.clear();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      for (const watcher of watchers.current.expire(Date.now() - WATCH_EXPIRE_MS)) {
        peers.current.get(watcher)?.close();
        peers.current.delete(watcher);
        pendingIce.current.delete(watcher);
        viaVideo.current.delete(watcher);
      }
      syncTransport();
    }, WATCH_PING_MS);
    return () => window.clearInterval(timer);
  }, [enabled, syncTransport]);

  return { channel, watchersOnVideo };
}

interface ViewerOptions {
  gameId: string | null;
  enabled: boolean;
  onFrame: (frame: TurnPreviewFrame | null) => void;
}

/**
 * A waiting phone. It announces itself, answers the publisher's offer, and
 * reports which transport it ended up on so the publisher knows whether the
 * fallback frames are still needed.
 */
export function useTurnVideoViewer({ gameId, enabled, onFrame }: ViewerOptions): MediaStream | null {
  const clientId = useMemo(() => newClientId(), []);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const peerFromRef = useRef<string | null>(null);
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const channelRef = useRef<TurnChannel | null>(null);
  const frameHandler = useRef(onFrame);

  useEffect(() => {
    frameHandler.current = onFrame;
  }, [onFrame]);

  const handleSignal = useCallback(
    async (signal: TurnSignal) => {
      const channel = channelRef.current;
      if (!channel || signal.to !== clientId) return;

      if (signal.kind === "offer" && signal.sdp) {
        peerRef.current?.close();
        const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerRef.current = peer;
        peerFromRef.current = signal.from;

        peer.ontrack = (event) => {
          setVideoStream(event.streams[0] ?? null);
          channel.publishSignal({
            kind: "transport",
            from: clientId,
            to: signal.from,
            transport: "webrtc",
          });
        };
        peer.onicecandidate = (event) => {
          if (!event.candidate) return;
          channel.publishSignal({
            kind: "ice",
            from: clientId,
            to: signal.from,
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              usernameFragment: event.candidate.usernameFragment ?? null,
            },
          });
        };
        peer.onconnectionstatechange = () => {
          if (peer.connectionState !== "failed" && peer.connectionState !== "disconnected") return;
          // Falling back is not an error state: the frames are still arriving.
          setVideoStream(null);
          channel.publishSignal({
            kind: "transport",
            from: clientId,
            to: signal.from,
            transport: "jpeg",
          });
        };

        await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        await flushIceCandidates(peer, pendingIce.current.get(signal.from) ?? []);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        channel.publishSignal({
          kind: "answer",
          from: clientId,
          to: signal.from,
          sdp: answer.sdp,
        });
        return;
      }

      if (signal.kind === "ice" && signal.candidate) {
        const pending = pendingIce.current.get(signal.from) ?? [];
        pendingIce.current.set(signal.from, pending);
        const peer = peerFromRef.current === signal.from ? peerRef.current : null;
        await queueOrApplyIceCandidate(peer, pending, signal.candidate);
      }
    },
    [clientId],
  );

  const channel = useTurnChannel(enabled ? gameId : null, {
    onFrame: (frame) => frameHandler.current(frame),
    onSignal: (signal) => void handleSignal(signal),
  });

  useEffect(() => {
    channelRef.current = channel;
  }, [channel]);

  // Announcing on a timer rather than once means a watcher that arrives before
  // the player's turn starts is still picked up when it does.
  useEffect(() => {
    if (!enabled || !channel) return;
    const ping = () => channel.publishSignal({ kind: "watch", from: clientId });
    ping();
    const timer = window.setInterval(ping, WATCH_PING_MS);
    const giveUp = window.setTimeout(() => {
      // Nothing to do but keep the frames; the publisher already knows.
    }, CONNECT_TIMEOUT_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(giveUp);
    };
  }, [channel, clientId, enabled]);

  useEffect(() => {
    if (enabled) return;
    const peer = peerRef.current;
    peerRef.current = null;
    peerFromRef.current = null;
    pendingIce.current.clear();
    peer?.close();
  }, [enabled]);

  useEffect(() => {
    const peer = peerRef;
    const queuedCandidates = pendingIce.current;
    return () => {
      peer.current?.close();
      peer.current = null;
      peerFromRef.current = null;
      queuedCandidates.clear();
    };
  }, []);

  // Derived rather than cleared through state: a disabled viewer simply has no
  // stream, and the next offer installs a fresh one.
  return enabled ? videoStream : null;
}
