from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import modal

APP_NAME = "camera-quest-vision"
MODEL_VERSION = "rfdetr-large-coco-v1"
MODEL_DIR = Path(f"/models/{MODEL_VERSION}")
ENGINE_PATH = MODEL_DIR / "rfdetr-large-b5-fp16.trt"
MANIFEST_PATH = MODEL_DIR / "manifest.json"

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

cpu_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "curl")
    .pip_install(*cpu_packages)
    .run_commands(
        "mkdir -p /models",
        "curl -fsSL -o /models/face_landmarker.task "
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
        "face_landmarker/float16/1/face_landmarker.task",
    )
    .add_local_dir("app", remote_path="/root/app")
)

gpu_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install(
        "numpy>=2.0,<3",
        "opencv-python-headless>=4.11,<5",
        "rfdetr[tensorrt]>=1.4,<2",
        "torch>=2.7,<3",
    )
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@app.function(
    image=gpu_image,
    gpu="T4",
    region="ap-northeast",
    timeout=1800,
    volumes={"/models": model_volume},
)
def build_tensorrt_artifact() -> dict[str, Any]:
    """Run once per release on T4; TensorRT engines are GPU-family specific."""
    import tensorrt as trt
    from rfdetr import RFDETRLarge

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model = RFDETRLarge()
    model.export(
        format="tensorrt",
        output_dir=str(MODEL_DIR),
        output_name=ENGINE_PATH.stem,
        shape=(512, 512),
        batch_size=5,
        dynamic_batch=False,
        fp16=True,
    )
    if not ENGINE_PATH.is_file():
        raise RuntimeError(f"RF-DETR export did not create {ENGINE_PATH}")
    manifest = {
        "modelVersion": MODEL_VERSION,
        "engineSha256": sha256(ENGINE_PATH),
        "batchSize": 5,
        "shape": [512, 512],
        "precision": "fp16",
        "tensorrtVersion": trt.__version__,
        "classNames": {str(key): value for key, value in model.class_names.items()},
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
    model_volume.commit()
    return manifest


@app.cls(
    image=gpu_image,
    gpu="T4",
    region="ap-northeast",
    min_containers=0,
    scaledown_window=600,
    timeout=30,
    volumes={"/models": model_volume},
)
class RFDetrGpu:
    @modal.enter()
    def load(self) -> None:
        import tensorrt as trt
        import torch

        if not ENGINE_PATH.is_file() or not MANIFEST_PATH.is_file():
            raise RuntimeError("Run `modal run modal_app.py::build_tensorrt_artifact` first")
        self.manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if sha256(ENGINE_PATH) != self.manifest["engineSha256"]:
            raise RuntimeError("RF-DETR TensorRT checksum mismatch")

        logger = trt.Logger(trt.Logger.WARNING)
        runtime = trt.Runtime(logger)
        self.engine = runtime.deserialize_cuda_engine(ENGINE_PATH.read_bytes())
        if self.engine is None:
            raise RuntimeError("Could not deserialize TensorRT engine")
        self.context = self.engine.create_execution_context()
        self.torch = torch
        self.trt = trt
        self.class_names = self.manifest["classNames"]

    @modal.method()
    def warm(self) -> dict[str, str]:
        return {
            "modelVersion": self.manifest["modelVersion"],
            "checksum": self.manifest["engineSha256"],
        }

    @modal.method()
    def detect_batch(self, frames: list[bytes]) -> list[list[dict[str, Any]]]:
        import cv2
        import numpy as np

        if len(frames) != 5:
            raise ValueError("RF-DETR TensorRT engine requires fixed batch 5")
        images = []
        for raw in frames:
            image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
            if image is None or image.shape[:2] != (512, 512):
                raise ValueError("GPU frame must be 512x512")
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            images.append(np.transpose(rgb, (2, 0, 1)))
        batch = np.stack(images)
        batch = (batch - np.array([0.485, 0.456, 0.406], dtype=np.float32)[None, :, None, None])
        batch /= np.array([0.229, 0.224, 0.225], dtype=np.float32)[None, :, None, None]

        input_tensor = self.torch.from_numpy(batch).to("cuda", dtype=self.torch.float32)
        tensors: dict[str, Any] = {}
        input_name = ""
        for index in range(self.engine.num_io_tensors):
            name = self.engine.get_tensor_name(index)
            mode = self.engine.get_tensor_mode(name)
            if mode == self.trt.TensorIOMode.INPUT:
                input_name = name
                self.context.set_input_shape(name, tuple(input_tensor.shape))
                tensors[name] = input_tensor
            else:
                shape = tuple(self.context.get_tensor_shape(name))
                dtype = self.trt.nptype(self.engine.get_tensor_dtype(name))
                torch_dtype = self.torch.from_numpy(np.empty((), dtype=dtype)).dtype
                tensors[name] = self.torch.empty(shape, device="cuda", dtype=torch_dtype)

        if not input_name:
            raise RuntimeError("TensorRT input tensor is missing")
        for name, tensor in tensors.items():
            self.context.set_tensor_address(name, tensor.data_ptr())
        stream = self.torch.cuda.current_stream()
        if not self.context.execute_async_v3(stream.cuda_stream):
            raise RuntimeError("TensorRT execution failed")
        stream.synchronize()

        boxes_name = next(name for name in tensors if "dets" in name)
        logits_name = next(name for name in tensors if "labels" in name)
        boxes = tensors[boxes_name].float().cpu().numpy()
        logits = tensors[logits_name].float().cpu().numpy()[..., :-1]
        scores_all = 1.0 / (1.0 + np.exp(-np.clip(logits, -88, 88)))
        scores = scores_all.max(axis=-1)
        class_ids = scores_all.argmax(axis=-1)

        output: list[list[dict[str, Any]]] = []
        for frame_index in range(5):
            frame_output = []
            for query_index in np.flatnonzero(scores[frame_index] >= 0.40):
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
    image=cpu_image,
    secrets=[modal.Secret.from_name("camera-quest-vision-secrets")],
    region="ap-northeast",
    routing_region="ap-south",
    min_containers=0,
    scaledown_window=600,
    timeout=45,
)
@modal.asgi_app()
def api() -> Any:
    from app.api.main import create_app
    from app.services import build_services
    from app.settings import get_settings

    return create_app(build_services(get_settings(), RFDetrGpu()))
