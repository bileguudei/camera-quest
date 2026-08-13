import { z } from "zod";
import type { components } from "@/generated/vision-api";

type ApiVisionOutcome = components["schemas"]["VisionOutcome"];
type ApiVisionVerdict = components["schemas"]["VisionVerdict"];
type ApiCalibrationResponse = components["schemas"]["CalibrationResponse"];

export interface DetectionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Detection {
  id: string;
  className: string;
  label: string;
  score: number;
  box: DetectionBox;
  isTarget: boolean;
}

export const visionOutcomeSchema: z.ZodType<ApiVisionOutcome> = z.object({
  turnId: z.uuid(),
  elapsedMs: z.number().int().nonnegative(),
  points: z.number().int().nonnegative(),
  xp: z.number().int().nonnegative(),
  totalScore: z.number().int().nonnegative(),
  totalXp: z.number().int().nonnegative(),
  level: z.number().int().min(1).max(50),
  streak: z.number().int().nonnegative(),
  unlockedAchievementIds: z.array(z.string()),
});

export const visionVerdictSchema: z.ZodType<ApiVisionVerdict> = z.object({
  decision: z.enum(["continue", "pass", "system_error"]),
  progress: z.number().min(0).max(1),
  detections: z.array(
    z.object({
      label: z.string(),
      confidence: z.number().min(0).max(1),
      box: z.object({
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
      }),
      target: z.boolean(),
    }),
  ),
  note: z.string().nullish(),
  outcome: visionOutcomeSchema.nullish(),
});

export type VisionOutcome = z.infer<typeof visionOutcomeSchema>;
export type VisionVerdict = z.infer<typeof visionVerdictSchema>;

export const calibrationResponseSchema: z.ZodType<ApiCalibrationResponse> = z.object({
  calibrationToken: z.string().min(16),
  backgroundClasses: z.array(z.string()),
});

export type CalibrationResponse = z.infer<typeof calibrationResponseSchema>;
