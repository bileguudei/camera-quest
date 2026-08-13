"use client";

import { z } from "zod";
import { captureFrameBatch } from "@/features/camera/frameCapture";
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

export async function warmVisionService(accessToken: string): Promise<void> {
  if (!publicEnv.visionEnabled || !publicEnv.visionUrl) return;
  const response = await fetch(endpoint("/v1/warmup"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new AppError("VISION_UNAVAILABLE", "Vision warm-up failed", true);
}
