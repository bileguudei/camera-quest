from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

from app.api.main import create_app


def main() -> None:
    settings = SimpleNamespace(
        max_body_bytes=1_572_864,
        cors_origins=["http://localhost:3000"],
        model_version="rfdetr-large-coco-v1",
        sentry_dsn=None,
    )
    services = SimpleNamespace(settings=settings)
    schema = create_app(cast(Any, services)).openapi()
    target = Path(__file__).resolve().parents[1] / "openapi.json"
    rendered = json.dumps(schema, indent=2, sort_keys=True) + "\n"
    if "--check" in sys.argv:
        if not target.is_file() or target.read_text(encoding="utf-8") != rendered:
            raise SystemExit("vision-service/openapi.json is stale")
        return
    target.write_text(rendered, encoding="utf-8")


if __name__ == "__main__":
    main()
