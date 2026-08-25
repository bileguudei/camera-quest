"use client";

import { useEffect } from "react";
import { getGameRepository } from "../infrastructure/createGameRepository";
import { GameActorContext } from "./GameProvider";

const HEARTBEAT_MS = 5_000;

/**
 * Keeps every phone at an online table on the same authoritative state. The
 * subscription lives above the screens so a table survives screen transitions,
 * and it is a no-op for local hot-seat games, which have no lobby.
 */
export function useLobbySync(): void {
  const actor = GameActorContext.useActorRef();
  const gameId = GameActorContext.useSelector((state) => state.context.lobby?.gameId ?? null);

  useEffect(() => {
    if (!gameId) return;
    const repository = getGameRepository();
    let heartbeating = false;
    const apply = (lobby: Awaited<ReturnType<typeof repository.heartbeatGame>>) =>
      actor.send({ type: "LOBBY_UPDATED", lobby });
    const heartbeat = () => {
      if (heartbeating) return;
      heartbeating = true;
      void repository
        .heartbeatGame(gameId)
        .then(apply)
        .catch(() => {
          // Realtime and the slow repository poll remain independent recovery
          // paths while a phone is briefly offline.
        })
        .finally(() => {
          heartbeating = false;
        });
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, HEARTBEAT_MS);
    const unsubscribe = repository.subscribeToGame(gameId, apply);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [actor, gameId]);
}
