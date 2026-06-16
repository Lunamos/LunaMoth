"""SEC-2: the provider api_key is GLOBAL, never copied into a per-session config.

A living chara's session config holds only non-secret overrides; the key is
resolved at load from the global keyring (~/.lunamoth/desktop.json). These pin
that contract: global resolution, env override, save never persists the secret
into a session, and a legacy embedded key is stripped on read.
"""
from __future__ import annotations

import json

import pytest

from lunamoth.session import settings as S


@pytest.fixture
def session_env(tmp_path, monkeypatch):
    """Point the (import-pinned) CONFIG_DIR/CONFIG_PATH at a per-session dir under
    a temp LUNAMOTH_HOME, so _is_session_config() and global_api_key() resolve there."""
    home = tmp_path / "home"
    (home / "sessions" / "probe").mkdir(parents=True)
    monkeypatch.setenv("LUNAMOTH_HOME", str(home))
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    sess = (home / "sessions" / "probe").resolve()
    monkeypatch.setattr(S, "CONFIG_DIR", sess)
    monkeypatch.setattr(S, "CONFIG_PATH", sess / "config.json")
    return home, sess


def _write_global_key(home, key="sk-GLOBAL"):
    (home / "desktop.json").write_text(
        json.dumps({"provider": "openrouter", "api_key": key}), encoding="utf-8")


def _write_session(sess, data):
    (sess / "config.json").write_text(json.dumps(data), encoding="utf-8")


def test_session_resolves_key_from_global_keyring(session_env):
    home, sess = session_env
    _write_global_key(home, "sk-GLOBAL")
    _write_session(sess, {"provider": "openrouter", "model": "m"})  # NO api_key
    assert S.load_settings().api_key == "sk-GLOBAL"


def test_env_overrides_global(session_env, monkeypatch):
    home, sess = session_env
    _write_global_key(home, "sk-GLOBAL")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-ENV")
    _write_session(sess, {"provider": "openrouter"})
    assert S.load_settings().api_key == "sk-ENV"


def test_save_settings_never_persists_key_into_session(session_env):
    home, sess = session_env
    S.save_settings(S.Settings(provider="openrouter", api_key="sk-LEAK", model="m"))
    raw = json.loads((sess / "config.json").read_text(encoding="utf-8"))
    assert not raw.get("api_key")            # secret not written
    assert raw.get("provider") == "openrouter"  # non-secret overrides kept


def test_load_strips_legacy_embedded_session_key(session_env):
    home, sess = session_env
    _write_global_key(home, "sk-GLOBAL")
    _write_session(sess, {"provider": "openrouter", "api_key": "sk-STALE"})
    st = S.load_settings()
    assert st.api_key == "sk-GLOBAL"         # global wins over the stale copy
    raw = json.loads((sess / "config.json").read_text(encoding="utf-8"))
    assert "api_key" not in raw              # and the stale copy is stripped from disk


def test_is_session_config_true_under_sessions(session_env):
    assert S._is_session_config() is True


def test_bulk_key_update_is_noop_after_sec2():
    from lunamoth.server import hub as H
    assert H.key_update_candidates() == []
    assert H.apply_default_key(["anything"]) == {"updated": [], "skipped": [], "candidates": []}


def test_named_key_resolved_by_route(session_env):
    home, sess = session_env
    (home / "desktop.json").write_text(json.dumps({
        "provider": "openrouter", "api_key": "sk-DEFAULT",
        "keys": {"alt": {"provider": "openrouter",
                         "base_url": "https://alt.example/v1", "api_key": "sk-ALT"}},
    }), encoding="utf-8")
    # a chara on the alt route resolves the alt key (multi-key preserved)
    _write_session(sess, {"provider": "openrouter", "base_url": "https://alt.example/v1"})
    assert S.load_settings().api_key == "sk-ALT"
    # a chara on the default route resolves the default key
    _write_session(sess, {"provider": "openrouter", "base_url": ""})
    assert S.load_settings().api_key == "sk-DEFAULT"
