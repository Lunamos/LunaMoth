"""Distribution lock: LUNAMOTH_FORCE_SANDBOX pins every chara to the sandbox jail and
refuses admin — at the isolation authority (backend), the child-launch map, and the
wake / set_isolation RPCs — so a hosted LunaMoth can't be escaped or reconfigured out
of its jail. The UI greys the toggle off hub.state.force_sandbox (tested in vitest)."""
from __future__ import annotations

import json

import pytest

from lunamoth.session import isolation as I
from lunamoth.session import sessions as S


def test_force_sandbox_env_parsing(monkeypatch):
    for v in ("1", "true", "yes", "on", "TRUE", " On "):
        monkeypatch.setenv("LUNAMOTH_FORCE_SANDBOX", v)
        assert I.force_sandbox() is True
    for v in ("", "0", "no", "off", "false"):
        monkeypatch.setenv("LUNAMOTH_FORCE_SANDBOX", v)
        assert I.force_sandbox() is False


def test_backend_clamps_admin_when_forced(monkeypatch):
    monkeypatch.setenv("LUNAMOTH_PY_BACKEND", "admin")
    monkeypatch.delenv("LUNAMOTH_FORCE_SANDBOX", raising=False)
    assert I.backend() == "admin"  # unlocked: admin honoured
    monkeypatch.setenv("LUNAMOTH_FORCE_SANDBOX", "1")
    assert I.backend() == "sandbox"  # locked: clamped at the authority every runner reads
    monkeypatch.setenv("LUNAMOTH_PY_BACKEND", "sandbox")
    assert I.backend() == "sandbox"


def test_isolation_to_backend_clamps_when_forced(monkeypatch):
    monkeypatch.delenv("LUNAMOTH_FORCE_SANDBOX", raising=False)
    assert S.isolation_to_backend("admin") == "admin"
    monkeypatch.setenv("LUNAMOTH_FORCE_SANDBOX", "1")
    assert S.isolation_to_backend("admin") == "sandbox"  # child launched jailed
    assert S.isolation_to_backend("sandbox") == "sandbox"


# ---- hub RPC enforcement ---------------------------------------------------------

@pytest.fixture
def hub_env(tmp_path, monkeypatch):
    monkeypatch.setenv("LUNAMOTH_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("LUNAMOTH_FORCE_SANDBOX", "1")
    from lunamoth.server import hub as H
    H.save_key("default", provider="openrouter", base_url="https://example.invalid/v1",
               api_key="sk-test", model="test/model")
    H.use_key("default")
    return H


def _dispatch(H, method, params=None):
    d = H.HubDispatcher(lambda f: True)
    return d.dispatch({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}})


def test_hub_state_reports_force_sandbox(hub_env):
    r = _dispatch(hub_env, "hub.state")["result"]
    assert r["force_sandbox"] is True


def test_wake_clamps_isolation_to_sandbox_when_forced(hub_env):
    card = str(hub_env.bundled_cards_dir() / "LunaMoth" / "card.json")
    entry = _dispatch(hub_env, "session.wake", {"card": card, "isolation": "admin"})["result"]
    meta = S.load_session(entry["name"])
    cfg = json.loads(meta.config_path.read_text(encoding="utf-8"))
    assert meta.isolation == "sandbox"     # admin request clamped at wake
    assert cfg["py_backend"] == "sandbox"  # child launches jailed


def test_set_isolation_refuses_admin_when_forced(hub_env):
    card = str(hub_env.bundled_cards_dir() / "LunaMoth" / "card.json")
    entry = _dispatch(hub_env, "session.wake", {"card": card})["result"]
    resp = _dispatch(hub_env, "chara.set_isolation", {"name": entry["name"], "isolation": "admin"})
    assert "error" in resp and resp["error"]["code"] == -32602
    # sandbox→sandbox is still fine (a no-op tightening)
    ok = _dispatch(hub_env, "chara.set_isolation", {"name": entry["name"], "isolation": "sandbox"})
    assert ok["result"]["isolation"] == "sandbox"
