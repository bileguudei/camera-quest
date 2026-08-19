"use client";

import { useEffect } from "react";
import { getGameRepository } from "../infrastructure/createGameRepository";
import { GameActorContext } from "./GameProvider";

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
    return getGameRepository().subscribeToGame(gameId, (lobby) =>
      actor.send({ type: "LOBBY_UPDATED", lobby }),
    );
  }, [actor, gameId]);
}
