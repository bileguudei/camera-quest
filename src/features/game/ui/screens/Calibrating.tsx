"use client";

import { ScanFace } from "lucide-react";
import { useEffect, useRef } from "react";
import { CameraFrame } from "@/features/game/ui/components/CameraFrame";
import { Screen } from "@/features/game/ui/components/Screen";
import { useCameraContext } from "@/features/camera/CameraProvider";
import { useGame } from "@/features/game/application/useGame";
import { getGameRepository } from "@/features/game/infrastructure/createGameRepository";
import { calibrate } from "@/features/vision/visionClient";
import { toAppError } from "@/shared/errors/appError";

export function Calibrating() {
  const facing = useGame((state) => state.cameraFacing);
  const demo = useGame((state) => state.cameraMode === "demo");
  const local = useGame((state) => state.backendMode === "local");
  const gameId = useGame((state) => state.gameId);
  const prepareTurn = useGame((state) => state.prepareTurn);
  const preparationFailed = useGame((state) => state.preparationFailed);
  const { stream, retry } = useCameraContext();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const prepareTurnRef = useRef(prepareTurn);
  const preparationFailedRef = useRef(preparationFailed);
  const retryCameraRef = useRef(retry);
  const frameRetryUsedRef = useRef(false);

  useEffect(() => {
    prepareTurnRef.current = prepareTurn;
    preparationFailedRef.current = preparationFailed;
    retryCameraRef.current = retry;
  }, [preparationFailed, prepareTurn, retry]);

  useEffect(() => {
    if (!demo && (!stream || !videoRef.current)) return;
    const controller = new AbortController();

    const run = async () => {
      if (local || demo) {
        await prepareTurnRef.current({
          token: "local-calibration-token",
          backgroundClasses: [],
        });
        return;
      }
      if (!gameId) throw new Error("Game id missing before calibration");
      const accessToken = await getGameRepository().getAccessToken();
      const ticket = await getGameRepository().issueVisionTicket(gameId);
      const result = await calibrate(
        videoRef.current!,
        accessToken,
        ticket.ticket,
        controller.signal,
      );
      await prepareTurnRef.current({
        token: result.calibrationToken,
        backgroundClasses: result.backgroundClasses,
      });
    };

    void run().catch((error: unknown) => {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }
      const appError = toAppError(error);
      if (appError.code === "INVALID_FRAME" && !frameRetryUsedRef.current) {
        frameRetryUsedRef.current = true;
        retryCameraRef.current();
        return;
      }
      if (process.env.NODE_ENV === "development") {
        const cause = error instanceof Error ? `${error.name} — ${error.message}` : typeof error;
        // Metadata only: never log captured frames, tokens, or response bodies.
        console.error(
          `Camera Quest turn preparation failed: ${appError.code} — ${appError.message}; cause: ${cause}`,
        );
      }
      preparationFailedRef.current(appError.code);
    });
    return () => controller.abort();
  }, [demo, gameId, local, stream]);

  return (
    <Screen padding="none" backdrop={false}>
      <CameraFrame
        stream={stream}
        facing={facing}
        demo={demo}
        videoRef={videoRef}
        className="absolute inset-0 size-full"
      >
        <div className="absolute inset-0 grid place-items-center bg-bg/45 px-6 text-center backdrop-blur-[2px]">
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-g4 border border-white/10 bg-black/65 p-6">
            <ScanFace className="size-12 animate-pulse text-primary" strokeWidth={2.2} />
            <h1 className="font-display text-2xl font-black text-ink">Орчноо тохируулж байна</h1>
            <p className="text-sm leading-relaxed text-ink-3">
              Камераа хөдөлгөхгүй барина уу. 5 neutral frame түр боловсруулагдаад хадгалагдахгүй.
            </p>
          </div>
        </div>
      </CameraFrame>
    </Screen>
  );
}
