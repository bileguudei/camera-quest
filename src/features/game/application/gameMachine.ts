import { assign, setup } from "xstate";
import { ROUNDS, SEAT_AVATARS, SEAT_COLORS, TOTAL_ROUNDS } from "../domain/config";
import type {
  ActiveTurn,
  CameraFacing,
  CameraMode,
  GameEnvironment,
  GameSession,
  LobbyState,
  Player,
  PreparedTurn,
  TurnOutcome,
} from "../domain/types";

export interface GameContext {
  players: Player[];
  playerCount: number;
  gameId: string | null;
  roundIndex: number;
  turnIndex: number;
  preparedTurn: PreparedTurn | null;
  calibrationToken: string | null;
  deadlineAtMs: number | null;
  serverClockOffsetMs: number;
  roundSnapshot: Record<string, number>;
  lastOutcome: TurnOutcome | null;
  cameraFacing: CameraFacing;
  cameraMode: CameraMode;
  /** Chosen before the game starts; the server draws quests only from it. */
  environment: GameEnvironment;
  busy: boolean;
  errorCode: string | null;
  /** Set only for online tables; null keeps every local hot-seat path unchanged. */
  lobby: LobbyState | null;
}

export type GameEvent =
  | { type: "OPEN_SETUP" }
  | { type: "OPEN_ONLINE" }
  | { type: "LOBBY_UPDATED"; lobby: LobbyState }
  | { type: "GO_LANDING" }
  | { type: "GO_WINNER" }
  | { type: "SET_PLAYER_COUNT"; count: number }
  | { type: "SET_PLAYER_NAME"; id: string; name: string }
  | { type: "CONFIRM_PLAYERS" }
  | { type: "SET_CAMERA_FACING"; facing: CameraFacing }
  | { type: "SET_CAMERA_MODE"; mode: CameraMode }
  | { type: "SET_ENVIRONMENT"; environment: GameEnvironment }
  | { type: "START_GAME_PENDING" }
  | { type: "START_GAME"; session: GameSession }
  | { type: "GAME_FAILED"; code: string }
  | { type: "BEGIN_ROUND" }
  | { type: "PLAYER_READY" }
  | { type: "TURN_PREPARED"; turn: PreparedTurn; calibrationToken: string }
  | { type: "TURN_PREPARE_FAILED"; code: string }
  | { type: "REVEAL_DONE" }
  | { type: "TURN_ACTIVATED"; active: ActiveTurn }
  | { type: "TURN_RESOLVED"; outcome: TurnOutcome }
  | { type: "VISION_SYSTEM_ERROR" }
  | { type: "ADVANCE_TURN" }
  | { type: "NEXT_ROUND" }
  | { type: "COMPLETE_GAME_PENDING" }
  | { type: "PLAY_AGAIN" }
  | { type: "NEW_GAME" };

const pointerOf = (lobby: LobbyState | null) =>
  lobby ? `${lobby.currentRound}:${lobby.currentSeat}` : null;

function makePlayer(seat: number, previous?: Player): Player {
  return {
    id: previous?.id ?? `draft-${seat}`,
    seat,
    name: previous?.name ?? "",
    color: SEAT_COLORS[seat - 1],
    avatar: SEAT_AVATARS[seat - 1],
    score: 0,
    totalXp: previous?.totalXp ?? 0,
    level: previous?.level ?? 1,
    streak: previous?.streak ?? 0,
    profileId: previous?.profileId,
  };
}

const roster = (count: number, previous: Player[]) =>
  Array.from({ length: count }, (_, index) =>
    makePlayer(index + 1, previous.find((player) => player.seat === index + 1)),
  );

const scoreSnapshot = (players: Player[]) =>
  Object.fromEntries(players.map((player) => [player.id, player.score]));

export function createInitialGameContext(): GameContext {
  return {
    players: roster(2, []),
    playerCount: 2,
    gameId: null,
    roundIndex: 0,
    turnIndex: 0,
    preparedTurn: null,
    calibrationToken: null,
    deadlineAtMs: null,
    serverClockOffsetMs: 0,
    roundSnapshot: {},
    lastOutcome: null,
    cameraFacing: "environment",
    cameraMode: "live",
    environment: "home",
    busy: false,
    errorCode: null,
    lobby: null,
  };
}

export const gameMachine = setup({
  types: {
    context: {} as GameContext,
    events: {} as GameEvent,
  },
  guards: {
    hasMorePlayers: ({ context }) => context.turnIndex < context.players.length - 1,
    hasMoreRounds: ({ context }) => context.roundIndex < TOTAL_ROUNDS - 1,
    isOnline: ({ context }) => context.lobby !== null,
    onlineFinished: ({ context }) => context.lobby?.status === "completed",
    lobbyStarted: ({ event }) => event.type === "LOBBY_UPDATED" && !event.lobby.lobbyOpen,
    gameFinished: ({ event }) =>
      event.type === "LOBBY_UPDATED" && event.lobby.status !== "active",
    pointerMoved: ({ context, event }) =>
      event.type === "LOBBY_UPDATED" && pointerOf(event.lobby) !== pointerOf(context.lobby),
    roundAdvanced: ({ context, event }) =>
      event.type === "LOBBY_UPDATED" &&
      context.lobby !== null &&
      event.lobby.currentRound !== context.lobby.currentRound,
    // A phone that is not playing learns the result from the table, not from a
    // vision stream it never opened.
    spectatedTurnResolved: ({ context, event }) => {
      if (event.type !== "LOBBY_UPDATED") return false;
      const turn = event.lobby.lastTurn;
      if (!turn?.outcome || turn.seat === event.lobby.selfSeat) return false;
      return turn.outcome.turnId !== context.lastOutcome?.turnId;
    },
  },
  actions: {
    setPlayerCount: assign(({ context, event }) => {
      if (event.type !== "SET_PLAYER_COUNT") return {};
      const count = Math.min(6, Math.max(1, event.count));
      return { playerCount: count, players: roster(count, context.players) };
    }),
    setPlayerName: assign(({ context, event }) => {
      if (event.type !== "SET_PLAYER_NAME") return {};
      return {
        players: context.players.map((player) =>
          player.id === event.id ? { ...player, name: event.name.slice(0, 24) } : player,
        ),
      };
    }),
    setFacing: assign(({ event }) =>
      event.type === "SET_CAMERA_FACING" ? { cameraFacing: event.facing } : {},
    ),
    setCameraMode: assign(({ event }) =>
      event.type === "SET_CAMERA_MODE" ? { cameraMode: event.mode } : {},
    ),
    setEnvironment: assign(({ event }) =>
      event.type === "SET_ENVIRONMENT" ? { environment: event.environment } : {},
    ),
    markBusy: assign({ busy: true, errorCode: null }),
    clearBusy: assign({ busy: false, errorCode: null }),
    setFailure: assign(({ event }) => ({
      busy: false,
      errorCode:
        event.type === "GAME_FAILED" || event.type === "TURN_PREPARE_FAILED"
          ? event.code
          : "GAME_UNAVAILABLE",
    })),
    setVisionFailure: assign({
      busy: false,
      errorCode: "VISION_UNAVAILABLE",
      preparedTurn: null,
      calibrationToken: null,
      deadlineAtMs: null,
    }),
    startSession: assign(({ event }) => {
      if (event.type !== "START_GAME") return {};
      return {
        gameId: event.session.gameId,
        environment: event.session.environment,
        players: event.session.players,
        playerCount: event.session.players.length,
        roundIndex: 0,
        turnIndex: 0,
        preparedTurn: null,
        calibrationToken: null,
        lastOutcome: null,
        deadlineAtMs: null,
        roundSnapshot: scoreSnapshot(event.session.players),
        busy: false,
        errorCode: null,
      };
    }),
    setPreparedTurn: assign(({ event }) =>
      event.type === "TURN_PREPARED"
        ? {
            preparedTurn: event.turn,
            calibrationToken: event.calibrationToken,
            busy: false,
            errorCode: null,
          }
        : {},
    ),
    activateTurn: assign(({ event }) => {
      if (event.type !== "TURN_ACTIVATED") return {};
      return {
        deadlineAtMs: Date.parse(event.active.deadlineAt),
        serverClockOffsetMs: Date.parse(event.active.serverNow) - Date.now(),
        busy: false,
      };
    }),
    applyOutcome: assign(({ context, event }) => {
      if (event.type !== "TURN_RESOLVED") return {};
      const outcome = event.outcome;
      return {
        lastOutcome: outcome,
        deadlineAtMs: null,
        players: context.players.map((player) =>
          player.id === outcome.playerId
            ? {
                ...player,
                score: outcome.totalAfter,
                totalXp: outcome.totalXp,
                level: outcome.level,
                streak: outcome.streak,
              }
            : player,
        ),
      };
    }),
    nextPlayer: assign(({ context }) => ({
      turnIndex: context.turnIndex + 1,
      preparedTurn: null,
      calibrationToken: null,
      deadlineAtMs: null,
      lastOutcome: null,
      errorCode: null,
    })),
    nextRound: assign(({ context }) => ({
      roundIndex: context.roundIndex + 1,
      turnIndex: 0,
      preparedTurn: null,
      calibrationToken: null,
      deadlineAtMs: null,
      lastOutcome: null,
      roundSnapshot: scoreSnapshot(context.players),
      errorCode: null,
      busy: false,
    })),
    applyLobby: assign(({ context, event }) => {
      if (event.type !== "LOBBY_UPDATED") return {};
      const lobby = event.lobby;
      // The board only needs the roster fields; ready/left/isSelf stay on `lobby`.
      const players: Player[] = lobby.players.map((entry) => ({
        id: entry.id,
        profileId: entry.profileId,
        seat: entry.seat,
        name: entry.name,
        color: entry.color,
        avatar: entry.avatar,
        score: entry.score,
        totalXp: entry.totalXp,
        level: entry.level,
        streak: entry.streak,
      }));
      const seated = players.findIndex((player) => player.seat === lobby.currentSeat);
      const roundIndex = lobby.currentRound - 1;
      return {
        lobby,
        gameId: lobby.gameId,
        environment: lobby.environment,
        players,
        playerCount: players.length,
        roundIndex,
        turnIndex: seated < 0 ? 0 : seated,
        // Round deltas are measured from the scores the round opened with.
        roundSnapshot:
          roundIndex === context.roundIndex ? context.roundSnapshot : scoreSnapshot(players),
        busy: false,
      };
    }),
    applySpectatedOutcome: assign(({ event }) =>
      event.type === "LOBBY_UPDATED" && event.lobby.lastTurn?.outcome
        ? { lastOutcome: event.lobby.lastTurn.outcome, deadlineAtMs: null }
        : {},
    ),
    awaitPointer: assign({ busy: true, errorCode: null }),
    nextRoundOnline: assign(({ context }) => ({
      preparedTurn: null,
      calibrationToken: null,
      deadlineAtMs: null,
      lastOutcome: null,
      roundSnapshot: scoreSnapshot(context.players),
      errorCode: null,
      busy: false,
    })),
    leaveLobby: assign({ lobby: null, gameId: null, busy: false, errorCode: null }),
    resetMatch: assign(({ context }) => {
      const players = context.players.map((player) => ({ ...player, score: 0 }));
      return {
        players,
        roundIndex: 0,
        turnIndex: 0,
        preparedTurn: null,
        calibrationToken: null,
        deadlineAtMs: null,
        lastOutcome: null,
        roundSnapshot: scoreSnapshot(players),
        errorCode: null,
        busy: false,
      };
    }),
  },
}).createMachine({
  id: "cameraQuest",
  initial: "landing",
  context: createInitialGameContext,
  on: {
    // Keeping the table fresh everywhere means a phone that walks into any
    // screen still sees the authoritative scores and pointer.
    LOBBY_UPDATED: { actions: "applyLobby" },
    GO_LANDING: { target: ".landing", actions: "leaveLobby" },
    GO_WINNER: { target: ".winner" },
    SET_CAMERA_FACING: { actions: "setFacing" },
    SET_CAMERA_MODE: { actions: "setCameraMode" },
    SET_ENVIRONMENT: { actions: "setEnvironment" },
  },
  states: {
    landing: { on: { OPEN_SETUP: "setup", OPEN_ONLINE: "onlineStart" } },
    onlineStart: {
      on: {
        START_GAME_PENDING: { actions: "markBusy" },
        LOBBY_UPDATED: { target: "lobby", actions: "applyLobby" },
        GAME_FAILED: { actions: "setFailure" },
      },
    },
    lobby: {
      on: {
        START_GAME_PENDING: { actions: "markBusy" },
        LOBBY_UPDATED: [
          // The host closing the lobby is what sends every phone to its own
          // camera check; from there the flow is the single-device one.
          { guard: "lobbyStarted", target: "cameraCheck", actions: "applyLobby" },
          { actions: "applyLobby" },
        ],
        GAME_FAILED: { actions: "setFailure" },
      },
    },
    setup: {
      on: {
        SET_PLAYER_COUNT: { actions: "setPlayerCount" },
        SET_PLAYER_NAME: { actions: "setPlayerName" },
        CONFIRM_PLAYERS: "cameraCheck",
      },
    },
    cameraCheck: {
      on: {
        START_GAME_PENDING: { actions: "markBusy" },
        START_GAME: { target: "roundIntro", actions: "startSession" },
        GAME_FAILED: { actions: "setFailure" },
      },
    },
    roundIntro: { on: { BEGIN_ROUND: "playerHandoff" } },
    playerHandoff: {
      on: {
        PLAYER_READY: "calibrating",
        LOBBY_UPDATED: [
          {
            guard: "spectatedTurnResolved",
            target: "turnResult",
            actions: ["applyLobby", "applySpectatedOutcome"],
          },
          { guard: "gameFinished", target: "winner", actions: "applyLobby" },
          { actions: "applyLobby" },
        ],
      },
    },
    calibrating: {
      entry: "markBusy",
      on: {
        TURN_PREPARED: { target: "questReveal", actions: "setPreparedTurn" },
        TURN_PREPARE_FAILED: { target: "playerHandoff", actions: "setFailure" },
      },
    },
    questReveal: { on: { REVEAL_DONE: "countdown" } },
    countdown: {
      on: {
        TURN_ACTIVATED: { target: "playing", actions: "activateTurn" },
        TURN_PREPARE_FAILED: { target: "playerHandoff", actions: "setFailure" },
      },
    },
    playing: {
      on: {
        TURN_RESOLVED: { target: "turnResult", actions: "applyOutcome" },
        VISION_SYSTEM_ERROR: { target: "playerHandoff", actions: "setVisionFailure" },
      },
    },
    turnResult: {
      on: {
        ADVANCE_TURN: [
          // Online tables wait for the server pointer instead of guessing who
          // is next; the advance RPC is what produces the next LOBBY_UPDATED.
          { guard: "isOnline", actions: "awaitPointer" },
          { guard: "hasMorePlayers", target: "playerHandoff", actions: "nextPlayer" },
          { target: "roundResult" },
        ],
        LOBBY_UPDATED: [
          { guard: "gameFinished", target: "winner", actions: "applyLobby" },
          { guard: "roundAdvanced", target: "roundResult", actions: "applyLobby" },
          { guard: "pointerMoved", target: "playerHandoff", actions: "applyLobby" },
          { actions: "applyLobby" },
        ],
      },
    },
    roundResult: {
      on: {
        NEXT_ROUND: [
          { guard: "onlineFinished", target: "winner", actions: "clearBusy" },
          { guard: "isOnline", target: "roundIntro", actions: "nextRoundOnline" },
          { guard: "hasMoreRounds", target: "roundIntro", actions: "nextRound" },
          { target: "winner", actions: "clearBusy" },
        ],
        COMPLETE_GAME_PENDING: { actions: "markBusy" },
        GAME_FAILED: { actions: "setFailure" },
      },
    },
    winner: {
      on: {
        PLAY_AGAIN: { target: "roundIntro", actions: "resetMatch" },
        START_GAME_PENDING: { actions: "markBusy" },
        START_GAME: { target: "roundIntro", actions: "startSession" },
        GAME_FAILED: { actions: "setFailure" },
        NEW_GAME: { target: "setup", actions: "resetMatch" },
      },
    },
  },
});

export function currentRound(context: GameContext) {
  return ROUNDS[context.roundIndex];
}
