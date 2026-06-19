"""generate_image — the chara makes an image from a text prompt and saves it
into its own workspace (under ``works/`` by default, where the operator sees it).

A LunaMoth chara-life capability with no hermes counterpart. It mirrors the
``web.py`` gating pattern exactly:

- ``check_fn`` (``_check_image_key``) is a STATIC capability gate: it takes no
  args and can't see ``ctx``, so it only answers "is an image key configured?".
  A chara with no key never sees the tool at all → no surprise spend.
- the per-call network check (``if not ctx.network_on()``) lives in the HANDLER,
  because the network toggle is runtime state on ``ctx``.

No failure fallbacks: a generation/download/save error surfaces as a visible
``tool_error`` carrying the real message — never a fabricated success.
"""
from __future__ import annotations

import threading
import time
import uuid

from ..registry import registry, tool_error, tool_result
from ._image_gen import generate_bytes, image_key
from ._process_registry import get_registry


def _check_image_key() -> bool:
    """check_fn: the tool is only offered when the active image provider has a key."""
    return bool(image_key())


def _run_image_job(reg, ctx, job_id: str, prompt: str, size: str, path: str) -> None:
    """Background worker: generate + save, then push a completion event onto the
    process registry's queue (the agent drains it at the next turn boundary). Never
    raises (it runs on a daemon thread) — a failure is reported, never fabricated."""
    # Re-check the network at run time: the operator may have run /net off between
    # submit and this (possibly minutes-later) call. Never make the HTTP request
    # if the network is now off — report a failure instead.
    if not ctx.network_on():
        reg.completion_queue.put({
            "type": "image_gen", "session_id": job_id, "status": "failed",
            "error": "network turned off before generation ran (ask the operator "
                     "for /net on, then retry)",
            "prompt": prompt[:120],
        })
        return
    try:
        data = generate_bytes(prompt, size)
        saved = ctx.sandbox.write_bytes(path, data)
        reg.completion_queue.put({
            "type": "image_gen", "session_id": job_id, "status": "ready",
            "path": saved, "bytes": len(data), "prompt": prompt[:120],
        })
    except Exception as e:  # noqa: BLE001 — report the real failure via the queue
        reg.completion_queue.put({
            "type": "image_gen", "session_id": job_id, "status": "failed",
            "error": str(e)[:300], "prompt": prompt[:120],
        })


def generate_image(args, ctx) -> str:
    if not ctx.network_on():
        return tool_error(
            "image generation needs the network — it's off. Ask the operator to "
            "enable it (/net on) first."
        )
    if not image_key():
        return tool_error(
            "no image key configured — pick an image provider/model in "
            "Settings · 模型 · 生图模型 and add that provider's key in Settings · 提供商."
        )

    prompt = str(args.get("prompt") or "").strip()
    if not prompt:
        return tool_error("generate_image needs a `prompt`")

    size = str(args.get("size") or "2048x2048").strip() or "2048x2048"
    path = str(args.get("path") or "").strip()
    if not path:
        path = f"works/image-{int(time.time())}.png"

    # Generation runs in the BACKGROUND (some providers — e.g. async DashScope —
    # take minutes; a synchronous call would freeze the whole tool loop). Return
    # immediately; the worker pushes a completion event onto the process registry's
    # queue, which the agent drains at the next turn boundary and surfaces to the
    # model (hermes' background-job notification shape).
    job_id = f"img-{uuid.uuid4().hex[:8]}"
    reg = get_registry(ctx)
    threading.Thread(
        target=_run_image_job, args=(reg, ctx, job_id, prompt, size, path),
        name=f"imggen-{job_id}", daemon=True,
    ).start()

    return tool_result(
        ok=True, status="submitted", job_id=job_id, path=path, size=size,
        note=(
            "Image generation is running in the BACKGROUND (it can take a while — "
            "some providers are slow). Don't wait on it; continue what you were "
            "doing. You'll be notified automatically when it's ready or if it fails. "
            f"Do NOT show it yet — wait for the ready notification before writing MEDIA:{path}."
        ),
    )


SCHEMA = {
    "description": (
        "Generate an image from a text prompt and save it into your workspace "
        "(under works/ by default, where your user can see it). Runs in the "
        "BACKGROUND: this returns immediately ('submitted') with the intended path; "
        "you are notified automatically when the image is ready (or if it failed). "
        "Don't block waiting — keep working. Once you get the ready notification, "
        "show it to your user by writing a line MEDIA:<path> in your reply. "
        "Needs the network on and an image key configured."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "What to draw, in your own words.",
            },
            "size": {
                "type": "string",
                "description": "Image size as WIDTHxHEIGHT (default 2048x2048).",
            },
            "path": {
                "type": "string",
                "description": "Workspace-relative save path (default works/image-<time>.png).",
            },
        },
        "required": ["prompt"],
    },
}

registry.register(
    "generate_image", "media", SCHEMA, generate_image,
    check_fn=_check_image_key, emoji="🎨", max_result_size_chars=4000,
)
