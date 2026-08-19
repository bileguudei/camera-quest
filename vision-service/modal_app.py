from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import modal

APP_NAME = "camera-quest-vision"
MODEL_VERSION = "rfdetr-large-coco-v1"
MODEL_DIR = Path(f"/models/{MODEL_VERSION}")
ONNX_PATH = MODEL_DIR / "rfdetr-large.onnx"
LEGACY_ENGINE_PATH = MODEL_DIR / "rfdetr-large.trt"
MANIFEST_PATH = MODEL_DIR / "manifest.json"
LANDMARKER_DIR = Path("/opt/camera-quest")
FACE_LANDMARKER_PATH = LANDMARKER_DIR / "face_landmarker.task"
GPU_SCALEDOWN_WINDOW_SECONDS = 90
GPU_MAX_CONTAINERS = 3
GPU_MAX_CONCURRENT_INPUTS = 3
GPU_TARGET_CONCURRENT_INPUTS = 2
# One idle spare *only while the app already has load*; an idle app still scales
# to zero. A turn's WebSocket occupies an input slot for its whole 30 seconds, so
# without a spare the player who crosses `target_inputs` waits out a ~15s cold
# start inside their own turn clock. Costs one extra GPU during play only.
GPU_BUFFER_CONTAINERS = 1

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name("camera-quest-models", create_if_missing=True)

cpu_packages = [
    "cryptography>=44,<47",
    "fastapi>=0.116,<1",
    "google-genai>=1.0,<2",
    "httpx>=0.28,<1",
    "mediapipe>=0.10.21,<0.11",
    "numpy>=2.0,<3",
    "opencv-python-headless>=4.11,<5",
    "pydantic>=2.11,<3",
    "pydantic-settings>=2.10,<3",
    "PyJWT[crypto]>=2.10,<3",
    "python-multipart>=0.0.20,<1",
    "sentry-sdk[fastapi]>=2.35,<3",
]

telemetry_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "httpx>=0.28,<1",
        "pydantic>=2.11,<3",
        "pydantic-settings>=2.10,<3",
    )
    .add_local_dir("app", remote_path="/root/app")
)

gpu_runtime_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install(
        # Serving excludes PyTorch/RF-DETR; those are only needed while
        # producing the versioned ONNX artifact.
        "numpy==2.4.6",
        "opencv-python-headless==4.14.0.94",
        # 1.27+ PyPI wheels target CUDA 13; 1.26 is the latest CUDA 12.8 line.
        "onnxruntime-gpu==1.26.0",
    )
)

# The public ASGI app and RF-DETR now share one GPU container. Calibration
# already keeps this GPU warm for every game, so co-location removes a Modal
# RPC and a JPEG re-encode without adding another always-on worker.
gpu_api_image = (
    gpu_runtime_image
    .apt_install("libegl1", "libgles2", "curl")
    .pip_install(*cpu_packages)
    .run_commands(
        f"mkdir -p {LANDMARKER_DIR}",
        f"curl -fsSL -o {FACE_LANDMARKER_PATH} "
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
        "face_landmarker/float16/1/face_landmarker.task",
    )
    .env(
        {
            "FACE_LANDMARKER_PATH": str(FACE_LANDMARKER_PATH),
        }
    )
    .add_local_dir("app", remote_path="/root/app")
)

gpu_build_image = gpu_runtime_image.pip_install(
    "polygraphy==0.53.4",
    "rfdetr==1.9.2",
    "torch==2.9.1",
    "torchvision==0.24.1",
    # Explicit exporter tools avoid the CPU-only `onnxruntime` dependency
    # from replacing the CUDA provider in the runtime image.
    "onnx==1.22.0",
    "onnx-graphsurgeon==0.6.1",
    "onnxsim==0.7.3",
).env({"RF_HOME": "/models/rfdetr-cache"})


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@app.function(
    image=gpu_build_image,
    gpu="T4",
    # Prefer the broad Asia pool, with US West as a capacity fallback.
    region=["ap", "us-west"],
    timeout=1800,
    volumes={"/models": model_volume},
)
def build_model_artifact_remote() -> dict[str, Any]:
    """Build and checksum the release ONNX graph on the target GPU stack."""
    from importlib.metadata import version

    import onnxruntime as ort
    import torch
    from rfdetr import RFDETRLarge
    from rfdetr.assets.coco_classes import COCO_CLASSES

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    # The previous TensorRT artifact failed PyTorch/ONNX parity on T4.
    LEGACY_ENGINE_PATH.unlink(missing_ok=True)
    MANIFEST_PATH.unlink(missing_ok=True)
    model = RFDETRLarge()
    # Keep verified source weights after a later export failure so retries do
    # not download the same checkpoint into a fresh container.
    model_volume.commit()
    exported_path = Path(
        model.export(
            format="onnx",
            output_dir=str(MODEL_DIR),
            shape=(512, 512),
            batch_size=5,
            dynamic_batch=False,
        )
    )
    if exported_path != ONNX_PATH or not ONNX_PATH.is_file():
        raise RuntimeError(f"RF-DETR export returned {exported_path}; expected {ONNX_PATH}")

    weights_path = Path(str(model.model_config.pretrain_weights))
    if not weights_path.is_file():
        raise RuntimeError(f"RF-DETR source weights are missing at {weights_path}")
    manifest = {
        "modelVersion": MODEL_VERSION,
        "artifactSha256": sha256(ONNX_PATH),
        "sourceWeightsSha256": sha256(weights_path),
        "batchSize": 5,
        "shape": [512, 512],
        "precision": "fp32",
        "runtime": "onnxruntime-gpu",
        "onnxruntimeVersion": ort.__version__,
        "rfdetrVersion": version("rfdetr"),
        "torchVersion": str(torch.__version__),
        "cudaVersion": torch.version.cuda,
        # The pretrained head has 91 logits: slot 0 is unused/background and
        # slots 1..90 retain sparse COCO category IDs.
        "classNames": {str(key): value for key, value in COCO_CLASSES.items()},
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
    model_volume.commit()
    return manifest


@app.function(
    image=gpu_build_image,
    gpu="T4",
    region=["ap", "us-west"],
    timeout=300,
    volumes={"/models": model_volume},
)
def pytorch_reference(image: bytes, shape: int = 512) -> list[dict[str, Any]]:
    """Return a small reference summary used to verify exported-engine parity."""
    from io import BytesIO

    from PIL import Image
    from rfdetr import RFDETRLarge
    from rfdetr.assets.coco_classes import COCO_CLASSES

    model = RFDETRLarge()
    detections = model.predict(
        Image.open(BytesIO(image)).convert("RGB"),
        threshold=0,
        shape=(shape, shape),
    )
    ordered = sorted(
        zip(detections.class_id, detections.confidence, strict=True),
        key=lambda item: float(item[1]),
        reverse=True,
    )
    return [
        {
            "label": COCO_CLASSES[int(class_id)],
            "confidence": round(float(confidence), 4),
        }
        for class_id, confidence in ordered[:10]
    ]


@app.function(
    image=gpu_runtime_image,
    gpu="T4",
    region=["ap", "us-west"],
    timeout=300,
    volumes={"/models": model_volume},
)
def onnx_reference(image: bytes) -> dict[str, list[dict[str, Any]]]:
    """Inspect ONNX output parity against the PyTorch reference path."""
    import cv2
    import numpy as np
    import onnxruntime as ort

    decoded = cv2.imdecode(np.frombuffer(image, np.uint8), cv2.IMREAD_COLOR)
    if decoded is None or decoded.shape[:2] != (512, 512):
        raise ValueError("ONNX reference image must be 512x512")
    rgb = cv2.cvtColor(decoded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    batch = np.stack([np.transpose(rgb, (2, 0, 1))] * 5)
    session = ort.InferenceSession(
        str(MODEL_DIR / "rfdetr-large.onnx"),
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
    )
    class_names = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))["classNames"]

    def summarize(input_batch: Any) -> list[dict[str, Any]]:
        outputs = dict(
            zip(
                [item.name for item in session.get_outputs()],
                session.run(None, {session.get_inputs()[0].name: input_batch}),
                strict=True,
            )
        )
        logits = outputs["labels"][0]
        probabilities = 1 / (1 + np.exp(-np.clip(logits, -88, 88)))
        scores = probabilities.max(axis=-1)
        class_ids = probabilities.argmax(axis=-1)
        order = np.argsort(scores)[::-1][:10]
        return [
            {
                "label": class_names.get(str(int(class_ids[index])), str(class_ids[index])),
                "confidence": round(float(scores[index]), 4),
            }
            for index in order
        ]

    normalized = batch.copy()
    normalized -= np.array([0.485, 0.456, 0.406], dtype=np.float32)[None, :, None, None]
    normalized /= np.array([0.229, 0.224, 0.225], dtype=np.float32)[None, :, None, None]
    return {"normalized": summarize(normalized), "zeroToOne": summarize(batch)}


@app.local_entrypoint()
def build_model_artifact() -> None:
    """Explicitly submit the remote build and print only its public manifest."""
    print(json.dumps(build_model_artifact_remote.remote(), sort_keys=True))


@app.cls(
    image=gpu_runtime_image,
    # Prefer the low-cost T4, but keep an L4 fallback so a regional T4 shortage
    # cannot block every player at Camera Check.
    gpu=["T4", "L4"],
    # A narrow ap-northeast pin caused 45-second scheduling timeouts in staging.
    # Modal recommends broad regions for better cold-start capacity.
    region="ap",
    # Remote calls otherwise detour through Modal's default us-east router.
    # This class name is versioned because a deployed Function's routing region
    # cannot be changed in place.
    routing_region="ap-south",
    min_containers=0,
    max_containers=GPU_MAX_CONTAINERS,
    scaledown_window=GPU_SCALEDOWN_WINDOW_SECONDS,
    timeout=30,
    volumes={"/models": model_volume},
)
class RFDetrGpuRouted:
    @modal.enter()
    def load(self) -> None:
        import onnxruntime as ort

        if not ONNX_PATH.is_file() or not MANIFEST_PATH.is_file():
            raise RuntimeError("Run `modal run modal_app.py::build_model_artifact` first")
        self.manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if sha256(ONNX_PATH) != self.manifest["artifactSha256"]:
            raise RuntimeError("RF-DETR ONNX checksum mismatch")
        if "CUDAExecutionProvider" not in ort.get_available_providers():
            raise RuntimeError("ONNX Runtime CUDA provider is unavailable")

        self.session = ort.InferenceSession(
            str(ONNX_PATH),
            providers=["CUDAExecutionProvider"],
        )
        if self.session.get_providers()[0] != "CUDAExecutionProvider":
            raise RuntimeError("RF-DETR must not silently fall back to CPU inference")
        self.input_name = self.session.get_inputs()[0].name
        self.output_names = [output.name for output in self.session.get_outputs()]
        self.class_names = self.manifest["classNames"]

    @modal.method()
    def warm(self) -> dict[str, str]:
        return {
            "modelVersion": self.manifest["modelVersion"],
            "checksum": self.manifest["artifactSha256"],
        }

    @modal.method()
    def describe_runtime(self) -> dict[str, Any]:
        """Expose non-sensitive ONNX runtime metadata for release diagnostics."""
        return {
            "providers": self.session.get_providers(),
            "input": self.input_name,
            "outputs": self.output_names,
        }

    @modal.method()
    def benchmark_batch(self, frames: list[bytes], repeats: int = 3) -> dict[str, Any]:
        """Measure in-container compute separately from client/network latency."""
        import time

        import cv2
        import numpy as np

        if len(frames) != 5 or not 1 <= repeats <= 10:
            raise ValueError("Benchmark requires five frames and 1-10 repeats")
        started = time.perf_counter()
        images = []
        for raw in frames:
            image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
            if image is None or image.shape[:2] != (512, 512):
                raise ValueError("GPU frame must be 512x512")
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            images.append(np.transpose(rgb, (2, 0, 1)))
        batch = np.stack(images)
        batch -= np.array([0.485, 0.456, 0.406], dtype=np.float32)[None, :, None, None]
        batch /= np.array([0.229, 0.224, 0.225], dtype=np.float32)[None, :, None, None]
        preprocessing_ms = round((time.perf_counter() - started) * 1000)
        inference_ms = []
        for _ in range(repeats):
            started = time.perf_counter()
            self.session.run(None, {self.input_name: batch})
            inference_ms.append(round((time.perf_counter() - started) * 1000))
        return {
            "provider": self.session.get_providers()[0],
            "preprocessingMs": preprocessing_ms,
            "inferenceMs": inference_ms,
        }

    @modal.method()
    def detect_batch(
        self,
        frames: list[bytes],
        threshold: float = 0.40,
    ) -> list[list[dict[str, Any]]]:
        import cv2
        import numpy as np

        if len(frames) != 5:
            raise ValueError("RF-DETR ONNX graph requires fixed batch 5")
        if not 0 <= threshold <= 1:
            raise ValueError("Detection threshold must be between 0 and 1")
        images = []
        for raw in frames:
            image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
            if image is None or image.shape[:2] != (512, 512):
                raise ValueError("GPU frame must be 512x512")
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            images.append(np.transpose(rgb, (2, 0, 1)))
        batch = np.stack(images)
        # RF-DETR 1.9 uses the same ImageNet-normalized torchvision pipeline
        # for predict() and export; parity here is required for valid logits.
        batch -= np.array([0.485, 0.456, 0.406], dtype=np.float32)[None, :, None, None]
        batch /= np.array([0.229, 0.224, 0.225], dtype=np.float32)[None, :, None, None]

        tensors = dict(
            zip(
                self.output_names,
                self.session.run(None, {self.input_name: batch}),
                strict=True,
            )
        )
        boxes = tensors["dets"]
        # RF-DETR's COCO checkpoint already uses a background/unused slot at 0;
        # the final logit is category 90 (toothbrush), so it must not be sliced.
        logits = tensors["labels"]
        scores_all = 1.0 / (1.0 + np.exp(-np.clip(logits, -88, 88)))
        scores = scores_all.max(axis=-1)
        class_ids = scores_all.argmax(axis=-1)

        output: list[list[dict[str, Any]]] = []
        for frame_index in range(5):
            frame_output = []
            for query_index in np.flatnonzero(scores[frame_index] >= threshold):
                cx, cy, width, height = boxes[frame_index, query_index]
                class_id = int(class_ids[frame_index, query_index])
                frame_output.append(
                    {
                        "label": self.class_names.get(str(class_id), str(class_id)),
                        "confidence": float(scores[frame_index, query_index]),
                        "box": {
                            "x": float(np.clip(cx - width / 2, 0, 1)),
                            "y": float(np.clip(cy - height / 2, 0, 1)),
                            "w": float(np.clip(width, 0.001, 1)),
                            "h": float(np.clip(height, 0.001, 1)),
                        },
                        "target": False,
                    }
                )
            output.append(frame_output)
        return output


@app.function(
    image=telemetry_image,
    secrets=[modal.Secret.from_name("camera-quest-vision-secrets")],
    region="ap-northeast",
    retries=3,
    timeout=15,
    scaledown_window=120,
)
async def record_attempt_job(
    turn_id: str,
    sequence_no: int,
    latency_ms: int,
    confidence: float,
    validator: str,
    decision: str,
    reason: str | None,
) -> None:
    """Persist metadata only; the RPC's unique key makes retries idempotent."""
    from app.models.supabase_gateway import SupabaseGateway
    from app.settings import get_settings

    settings = get_settings()
    gateway = SupabaseGateway(
        str(settings.supabase_url),
        settings.supabase_secret_key.get_secret_value(),
    )
    try:
        await gateway.record_attempt(
            turn_id,
            sequence_no,
            latency_ms,
            confidence,
            validator,
            decision,
            reason,
        )
    finally:
        await gateway.close()


class ModalAttemptTelemetrySink:
    async def submit(self, attempt: Any) -> None:
        # spawn.aio waits only for durable queue submission, not the Supabase RPC.
        await record_attempt_job.spawn.aio(
            attempt.turn_id,
            attempt.sequence_no,
            attempt.latency_ms,
            attempt.confidence,
            attempt.validator,
            attempt.decision,
            attempt.reason,
        )


@app.local_entrypoint()
def smoke_model(image_path: str, threshold: float = 0.40) -> None:
    """Run the deployed preprocessing/runtime path without exposing image data."""
    import time

    raw = Path(image_path).read_bytes()
    started = time.perf_counter()
    frames = RFDetrGpuRouted().detect_batch.remote([raw] * 5, threshold=threshold)
    summary = [
        {
            "count": len(frame),
            "top": [
                {
                    "label": detection["label"],
                    "confidence": round(detection["confidence"], 4),
                }
                for detection in sorted(
                    frame,
                    key=lambda detection: detection["confidence"],
                    reverse=True,
                )[:5]
            ],
        }
        for frame in frames
    ]
    print(
        json.dumps(
            {
                "elapsedMs": round((time.perf_counter() - started) * 1000),
                "frames": summary,
            },
            sort_keys=True,
        )
    )


@app.local_entrypoint()
def benchmark_model(image_path: str, repeats: int = 5) -> None:
    """Measure only in-container preprocessing/inference, excluding cold start and network."""
    raw = Path(image_path).read_bytes()
    print(json.dumps(RFDetrGpuRouted().benchmark_batch.remote([raw] * 5, repeats), sort_keys=True))


@app.local_entrypoint()
def smoke_reference(image_path: str) -> None:
    """Run the PyTorch reference at the ONNX export shape."""
    print(json.dumps(pytorch_reference.remote(Path(image_path).read_bytes()), sort_keys=True))


@app.local_entrypoint()
def inspect_runtime() -> None:
    """Print the ONNX CUDA contract without loading or retaining frames."""
    print(json.dumps(RFDetrGpuRouted().describe_runtime.remote(), sort_keys=True))


@app.local_entrypoint()
def smoke_onnx(image_path: str) -> None:
    """Compare ONNX preprocessing variants against the serving runtime."""
    print(json.dumps(onnx_reference.remote(Path(image_path).read_bytes()), sort_keys=True))


@app.function(
    image=gpu_api_image,
    gpu=["T4", "L4"],
    # The browser origin list lives in its own secret so adding a deployment URL
    # never risks rewriting the Supabase and signing credentials next to it.
    # It comes last: a value here intentionally wins over the base secret.
    secrets=[
        modal.Secret.from_name("camera-quest-vision-secrets"),
        modal.Secret.from_name("camera-quest-vision-origins"),
    ],
    region="ap",
    routing_region="ap-south",
    min_containers=0,
    max_containers=GPU_MAX_CONTAINERS,
    buffer_containers=GPU_BUFFER_CONTAINERS,
    scaledown_window=GPU_SCALEDOWN_WINDOW_SECONDS,
    timeout=45,
    volumes={"/models": model_volume},
)
# Browser preflight and warm-up requests can overlap briefly. Sharing one GPU
# container avoids duplicate cold starts without changing model inference.
@modal.concurrent(
    max_inputs=GPU_MAX_CONCURRENT_INPUTS,
    target_inputs=GPU_TARGET_CONCURRENT_INPUTS,
)
@modal.asgi_app()
def api() -> Any:
    from app.api.main import create_app
    from app.models.onnx_detector import OnnxObjectDetector
    from app.services import build_services
    from app.settings import get_settings

    settings = get_settings()
    return create_app(
        build_services(
            settings,
            OnnxObjectDetector(
                str(ONNX_PATH),
                str(MANIFEST_PATH),
                settings.model_version,
            ),
            attempt_sink=ModalAttemptTelemetrySink(),
        )
    )
