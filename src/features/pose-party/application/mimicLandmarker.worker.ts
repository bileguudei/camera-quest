/// <reference lib="webworker" />

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type {
  MimicTrackerCommand,
  MimicTrackerMessage,
} from "./mimicTrackerMessages";
import { headPoseFromMatrix } from "../domain/headPose";

const workerScope = self as DedicatedWorkerGlobalScope;
const WASM_ROOT = "/mediapipe/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let faceLandmarker: FaceLandmarker | null = null;
let initializing: Promise<void> | null = null;

const send = (message: MimicTrackerMessage) => workerScope.postMessage(message);

const initialize = async () => {
  if (faceLandmarker) return;
  if (initializing) return initializing;

  initializing = (async () => {
    send({ type: "loading", stage: "runtime" });
    const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);

    send({ type: "loading", stage: "face" });
    faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: "CPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });

    send({ type: "ready" });
  })().catch((error) => {
    initializing = null;
    throw error;
  });

  return initializing;
};

const processFrame = (bitmap: ImageBitmap, timestamp: number) => {
  try {
    if (!faceLandmarker) throw new Error("Mimic model бэлэн биш байна");
    const face = faceLandmarker.detectForVideo(bitmap, timestamp);

    const blendshapes: Record<string, number> = {};
    for (const category of face.faceBlendshapes[0]?.categories ?? []) {
      blendshapes[category.categoryName] = category.score;
    }

    send({
      type: "result",
      timestamp,
      observation: {
        faceLandmarks: (face.faceLandmarks[0] ?? []).map(({ x, y, z }) => ({ x, y, z })),
        blendshapes,
        headPose: headPoseFromMatrix(face.facialTransformationMatrixes[0]?.data ?? []),
      },
    });
  } finally {
    bitmap.close();
  }
};

workerScope.onmessage = (event: MessageEvent<MimicTrackerCommand>) => {
  const command = event.data;
  if (command.type === "init") {
    void initialize().catch((error) =>
      send({
        type: "error",
        message: error instanceof Error ? error.message : "Mimic model ачаалж чадсангүй",
      }),
    );
    return;
  }
  if (command.type === "frame") {
    try {
      processFrame(command.bitmap, command.timestamp);
    } catch (error) {
      send({
        type: "error",
        message: error instanceof Error ? error.message : "Камерын кадр таньж чадсангүй",
      });
    }
    return;
  }

  faceLandmarker?.close();
  faceLandmarker = null;
  initializing = null;
};
