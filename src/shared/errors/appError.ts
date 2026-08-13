export type AppErrorCode =
  | "CAMERA_DENIED"
  | "VISION_UNAVAILABLE"
  | "TURN_EXPIRED"
  | "INVALID_FRAME"
  | "UNAUTHORIZED"
  | "INVALID_REQUEST"
  | "GAME_UNAVAILABLE";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError("GAME_UNAVAILABLE", "Тоглоомын үйлчилгээ түр боломжгүй байна.", true);
}
