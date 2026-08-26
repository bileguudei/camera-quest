import type { MimicObservation } from "../domain/mimicRules";

export type ModelLoadStage = "runtime" | "face";

export type MimicTrackerCommand =
  | { type: "init" }
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number }
  | { type: "dispose" };

export type MimicTrackerMessage =
  | { type: "loading"; stage: ModelLoadStage }
  | { type: "ready" }
  | { type: "result"; observation: MimicObservation; timestamp: number }
  | { type: "error"; message: string };
