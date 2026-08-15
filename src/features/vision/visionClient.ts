"use client";

import { z } from "zod";
import {
  captureFrameBatch,
  captureFrameSequence,
} from "@/features/camera/frameCapture";
import { publicEnv } from "@/shared/env/publicEnv";
import { AppError } from "@/shared/errors/appError";
import {
  calibrationResponseSchema,
  visionVerdictSchema,
  type CalibrationResponse,
  type VisionVerdict,
} from "./visionTypes";

const visionErrorSchema = z.object({
  code: z.string().optional(),
  detail: z.object({ code: z.string().optional() }).optional(),
});

const streamMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("verdict"), verdict: visionVerdictSchema }),
  z.object({ type: z.literal("error"), code: z.string() }),
]);

const STREAM_RESPONSE_TIMEOUT_MS = 10_000;

export function visionErrorCode(status: number, payload: unknown) {
  const parsed = visionErrorSchema.safeParse(payload);
  const serverCode = parsed.success ? parsed.data.code ?? parsed.data.detail?.code : undefined;
  if (status === 401 || serverCode === "UNAUTHORIZED") return "UNAUTHORIZED" as const;
  if (serverCode === "TURN_EXPIRED") return "TURN_EXPIRED" as const;
  if (serverCode === "INVALID_FRAME") return "INVALID_FRAME" as const;
  return "VISION_UNAVAILABLE" as const;
}

const endpoint = (path: string) => {
  if (!publicEnv.visionUrl) throw new AppError("VISION_UNAVAILABLE", "Vision URL тохируулаагүй байна.", true);
  return new URL(path, publicEnv.visionUrl).toString();
};

export const visionStreamUrl = () => {
  const url = new URL(endpoint("/v1/stream"));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
};

const appendFrames = (body: FormData, frames: Blob[]) => {
  frames.forEach((frame, index) => body.append("frames", frame, `frame-${index}.jpg`));
};

async function postMultipart<T>(
  path: string,
  token: string,
  body: FormData,
  parse: (input: unknown) => T,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(endpoint(path), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
    signal,
  });
  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.clone().json();
    } catch {
      payload = undefined;
    }
    const code = visionErrorCode(response.status, payload);
    throw new AppError(
      code,
      `Vision request failed (${response.status})`,
      code === "INVALID_FRAME" || response.status >= 500,
    );
  }
  return parse(await response.json());
}

export async function calibrate(
  video: HTMLVideoElement,
  accessToken: string,
  signal?: AbortSignal,
): Promise<CalibrationResponse> {
  const body = new FormData();
  appendFrames(body, await captureFrameBatch(video, signal));
  return postMultipart(
    "/v1/calibrate",
    accessToken,
    body,
    (input) => calibrationResponseSchema.parse(input),
    signal,
  );
}

export async function scanTurn(
  video: HTMLVideoElement,
  accessToken: string,
  turnId: string,
  sequenceNo: number,
  calibrationToken: string,
  signal?: AbortSignal,
): Promise<VisionVerdict> {
  const body = new FormData();
  body.set("turnId", turnId);
  body.set("sequenceNo", String(sequenceNo));
  body.set("calibrationToken", calibrationToken);
  appendFrames(body, await captureFrameBatch(video, signal));
  return postMultipart(
    "/v1/validate",
    accessToken,
    body,
    (input) => visionVerdictSchema.parse(input),
    signal,
  );
}

export interface TurnVisionStream {
  scan: (
    video: HTMLVideoElement,
    sequenceNo: number,
    signal: AbortSignal,
  ) => Promise<VisionVerdict>;
  close: () => void;
}

type PendingVerdict = {
  resolve: (verdict: VisionVerdict) => void;
  reject: (error: unknown) => void;
  timeout: number;
};

type WebSocketFactory = (url: string) => WebSocket;

const streamError = (code: string) => {
  if (code === "TURN_EXPIRED") {
    return new AppError("TURN_EXPIRED", "Turn expired");
  }
  if (code === "INVALID_FRAME") {
    return new AppError("INVALID_FRAME", "Invalid camera frame", true);
  }
  if (code === "UNAUTHORIZED") {
    return new AppError("UNAUTHORIZED", "Vision authentication failed");
  }
  return new AppError("VISION_UNAVAILABLE", `Vision stream failed (${code})`, true);
};

class WebSocketTurnVisionStream implements TurnVisionStream {
  private socket: WebSocket | null = null;
  private connection: Promise<WebSocket> | null = null;
  private pending: PendingVerdict | null = null;
  private intentionallyClosed = false;

  constructor(
    private readonly url: string,
    private readonly accessToken: string,
    private readonly turnId: string,
    private readonly calibrationToken: string,
    private readonly socketFactory: WebSocketFactory,
  ) {}

  private connect(signal: AbortSignal): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    if (this.connection) return this.connection;

    this.connection = new Promise<WebSocket>((resolve, reject) => {
      const socket = this.socketFactory(this.url);
      this.socket = socket;
      const handleAbort = () => {
        cleanup();
        socket.close();
        reject(new DOMException("Aborted", "AbortError"));
      };
      const handleError = () => {
        cleanup();
        reject(new AppError("VISION_UNAVAILABLE", "Vision stream connection failed", true));
      };
      const handleCloseBeforeOpen = () => {
        cleanup();
        reject(new AppError("VISION_UNAVAILABLE", "Vision stream closed", true));
      };
      const cleanup = () => {
        signal.removeEventListener("abort", handleAbort);
        socket.removeEventListener("error", handleError);
        socket.removeEventListener("close", handleCloseBeforeOpen);
      };
      socket.addEventListener(
        "open",
        () => {
          cleanup();
          socket.addEventListener("message", this.handleMessage);
          socket.addEventListener("close", this.handleClose);
          socket.send(
            JSON.stringify({
              type: "authenticate",
              accessToken: this.accessToken,
              turnId: this.turnId,
              calibrationToken: this.calibrationToken,
            }),
          );
          resolve(socket);
        },
        { once: true },
      );
      socket.addEventListener("error", handleError, { once: true });
      socket.addEventListener("close", handleCloseBeforeOpen, { once: true });
      signal.addEventListener("abort", handleAbort, { once: true });
    }).finally(() => {
      this.connection = null;
    });
    return this.connection;
  }

  private handleMessage = (event: MessageEvent<unknown>) => {
    if (typeof event.data !== "string") return;
    let input: unknown;
    try {
      input = JSON.parse(event.data);
    } catch {
      this.rejectPending(new AppError("VISION_UNAVAILABLE", "Invalid stream response", true));
      return;
    }
    const message = streamMessageSchema.safeParse(input);
    if (!message.success) {
      this.rejectPending(new AppError("VISION_UNAVAILABLE", "Invalid stream response", true));
      return;
    }
    if (message.data.type === "ready") return;
    if (message.data.type === "error") {
      this.rejectPending(streamError(message.data.code));
      return;
    }
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    window.clearTimeout(pending.timeout);
    pending.resolve(message.data.verdict);
  };

  private handleClose = () => {
    this.socket = null;
    if (!this.intentionallyClosed) {
      this.rejectPending(new AppError("VISION_UNAVAILABLE", "Vision stream closed", true));
    }
  };

  private rejectPending(error: unknown) {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    window.clearTimeout(pending.timeout);
    pending.reject(error);
  }

  async scan(
    video: HTMLVideoElement,
    sequenceNo: number,
    signal: AbortSignal,
  ): Promise<VisionVerdict> {
    if (this.pending) {
      throw new AppError("VISION_UNAVAILABLE", "A vision batch is already in flight", true);
    }
    this.intentionallyClosed = false;
    const socket = await this.connect(signal);
    let verdictReceived = false;
    const captureController = new AbortController();
    const response = new Promise<VisionVerdict>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.rejectPending(
          new AppError("VISION_UNAVAILABLE", "Vision stream response timed out", true),
        );
        socket.close();
      }, STREAM_RESPONSE_TIMEOUT_MS);
      this.pending = {
        resolve: (verdict) => {
          verdictReceived = true;
          captureController.abort();
          resolve(verdict);
        },
        reject,
        timeout,
      };
    });
    const handleAbort = () => {
      captureController.abort();
      this.rejectPending(new DOMException("Aborted", "AbortError"));
      this.intentionallyClosed = true;
      socket.close();
    };
    signal.addEventListener("abort", handleAbort, { once: true });

    try {
      socket.send(JSON.stringify({ type: "batch", sequenceNo }));
      const capture = captureFrameSequence(
        video,
        (frame) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(frame);
          } else if (!verdictReceived) {
            throw new AppError("VISION_UNAVAILABLE", "Vision stream closed", true);
          }
        },
        captureController.signal,
      ).catch((error: unknown) => {
        if (
          verdictReceived &&
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
        throw error;
      });
      // Specialist validators can pass after four unanimous frames. Race the
      // server verdict against capture so a valid early pass cancels frame five.
      return await Promise.race([response, capture.then(() => response)]);
    } catch (error) {
      if (!verdictReceived) {
        captureController.abort();
        this.rejectPending(error);
        this.intentionallyClosed = true;
        socket.close();
      }
      return await response;
    } finally {
      signal.removeEventListener("abort", handleAbort);
    }
  }

  close() {
    this.intentionallyClosed = true;
    this.rejectPending(new DOMException("Aborted", "AbortError"));
    this.socket?.close();
    this.socket = null;
  }
}

export function createTurnVisionStream(
  accessToken: string,
  turnId: string,
  calibrationToken: string,
  socketFactory: WebSocketFactory = (url) => new WebSocket(url),
): TurnVisionStream | null {
  if (typeof WebSocket === "undefined") return null;
  return new WebSocketTurnVisionStream(
    visionStreamUrl(),
    accessToken,
    turnId,
    calibrationToken,
    socketFactory,
  );
}

export async function warmVisionService(
  accessToken: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!publicEnv.visionEnabled || !publicEnv.visionUrl) return;
  const response = await fetch(endpoint("/v1/warmup"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!response.ok) throw new AppError("VISION_UNAVAILABLE", "Vision warm-up failed", true);
}
