"use client";

import { ScanFace } from "lucide-react";
import { useEffect, useRef } from "react";
import { CameraFrame } from "@/features/game/ui/components/CameraFrame";
import { Screen } from "@/features/game/ui/components/Screen";
import { useCameraContext } from "@/features/camera/CameraProvider";
import { useGame } from "@/features/game/application/useGame";
import { getGameRepository } from "@/features/game/infrastructure/createGameRepository";
import { calibrate } from "@/features/vision/visionClient";

export function Calibrating() {
  const facing = useGame((state) => state.cameraFacing);
  const demo = useGame((state) => state.cameraMode === "demo");
  const local = useGame((state) => state.backendMode === "local");
  const prepareTurn = useGame((state) => state.prepareTurn);
  const preparationFailed = useGame((state) => state.preparationFailed);
  const { stream } = useCameraContext();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || (!demo && !videoRef.current)) return;
    started.current = true;
    const controller = new AbortController();

    const run = async () => {
      if (local || demo) {
        await prepareTurn({ token: "local-calibration-token", backgroundClasses: [] });
        return;
      }
      const accessToken = await getGameRepository().getAccessToken();
      const result = await calibrate(videoRef.current!, accessToken, controller.signal);
      await prepareTurn({
        token: result.calibrationToken,
        backgroundClasses: result.backgroundClasses,
      });
    };

    void run().catch(() => preparationFailed("VISION_UNAVAILABLE"));
    return () => controller.abort();
  }, [demo, local, preparationFailed, prepareTurn, stream]);

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
