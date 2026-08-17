from __future__ import annotations

import ast
from pathlib import Path

MODAL_APP = Path(__file__).parents[1] / "modal_app.py"


def _integer_constants() -> dict[str, int]:
    tree = ast.parse(MODAL_APP.read_text(encoding="utf-8"))
    constants: dict[str, int] = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if isinstance(target, ast.Name) and isinstance(node.value, ast.Constant):
            if isinstance(node.value.value, int):
                constants[target.id] = node.value.value
    return constants


def _decorator_names(node: ast.FunctionDef) -> set[str]:
    names: set[str] = set()
    for decorator in node.decorator_list:
        call = decorator if isinstance(decorator, ast.Call) else None
        if call is None or not isinstance(call.func, ast.Attribute):
            continue
        if isinstance(call.func.value, ast.Name):
            names.add(f"{call.func.value.id}.{call.func.attr}")
    return names


def test_gpu_cost_controls_preserve_scale_to_zero() -> None:
    constants = _integer_constants()

    assert constants["GPU_SCALEDOWN_WINDOW_SECONDS"] == 90
    assert constants["GPU_MAX_CONTAINERS"] == 1


def test_api_accepts_short_control_request_bursts_in_one_container() -> None:
    tree = ast.parse(MODAL_APP.read_text(encoding="utf-8"))
    api = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "api"
    )
    constants = _integer_constants()

    assert "modal.concurrent" in _decorator_names(api)
    assert constants["GPU_MAX_CONCURRENT_INPUTS"] == 3
    assert constants["GPU_TARGET_CONCURRENT_INPUTS"] == 2
