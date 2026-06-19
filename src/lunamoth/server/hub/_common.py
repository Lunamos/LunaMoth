"""Shared leaf helpers for the hub package — depended on by every submodule.

This module imports nothing from its hub siblings, so it can sit at the bottom
of the dependency graph and break would-be cycles.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from ...session import sessions as S
from ..dispatch import RpcError


class HubRpcError(RpcError):
    """Hub-scoped JSON-RPC error that may carry machine-readable error data."""

    def __init__(self, code: int, message: str, data: dict[str, Any] | None = None):
        super().__init__(code, message)
        self.data = data


def _atomic_write_json(path: Path, data: dict[str, Any], *, private: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        if private:
            try:
                tmp.chmod(0o600)
            except OSError:
                pass
        os.replace(tmp, path)
    finally:
        try:
            tmp.unlink()
        except OSError:
            pass


_SLUG_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _slug(name: str, fallback: str = "chara") -> str:
    s = _SLUG_RE.sub("-", name).strip("-._")
    if not s or not S.valid_name(s):
        s = fallback
    return s[:48]


def _meta(p: dict[str, Any]) -> S.SessionMeta:
    name = str(p.get("name") or "")
    meta = S.load_session(name)
    if meta is None:
        raise RpcError(-32004, f"no chara named {name!r}")
    return meta


def _await_supervisor(supervisor: Any, coro):
    # Hub handlers run in worker threads; submit coroutines back to the
    # supervisor's event loop and wait for the JSON-RPC result.
    import asyncio

    loop = getattr(supervisor, "loop", None)
    if loop is None:
        # Unit-test/fake supervisor path.
        return asyncio.run(coro)
    fut = asyncio.run_coroutine_threadsafe(coro, loop)
    return fut.result(timeout=60.0)
