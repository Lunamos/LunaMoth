"""The shared self-update core (lunamoth/updater.py).

The headline regression: a wheel install is URL-PINNED (install.sh:
`uv tool install "lunamoth @ <wheel-url>"`), so `uv tool upgrade` is a no-op —
the update must REINSTALL from the latest release wheel URL. These pin that, plus
the uv-not-found and no-release error paths, and wheel-URL extraction.
"""
from __future__ import annotations

import json
import subprocess

from lunamoth import updater


def _completed(cmd, code=0, out="", err=""):
    return subprocess.CompletedProcess(cmd, code, stdout=out, stderr=err)


def test_apply_wheel_reinstalls_from_latest_url_never_upgrade(monkeypatch):
    monkeypatch.setattr(updater, "is_dev", lambda: False)
    monkeypatch.setattr(updater, "find_uv", lambda: "/fake/uv")
    monkeypatch.setattr(updater, "latest_wheel_url",
                        lambda: "https://x/lunamoth-0.9.0-py3-none-any.whl")
    seen = {}

    def fake_run(cmd, **kw):
        seen["cmd"] = cmd
        return _completed(cmd, 0, "installed")
    monkeypatch.setattr(updater.subprocess, "run", fake_run)

    res = updater.apply()
    assert res["ok"] and res["restart_required"]
    # reinstall from the latest URL — NOT `uv tool upgrade` (the no-op that never worked)
    assert seen["cmd"] == ["/fake/uv", "tool", "install", "--force",
                           "lunamoth[server,messaging] @ https://x/lunamoth-0.9.0-py3-none-any.whl"]
    assert "upgrade" not in seen["cmd"]


def test_apply_wheel_no_release_is_a_clear_error(monkeypatch):
    monkeypatch.setattr(updater, "is_dev", lambda: False)
    monkeypatch.setattr(updater, "find_uv", lambda: "/fake/uv")
    monkeypatch.setattr(updater, "latest_wheel_url", lambda: None)
    res = updater.apply()
    assert res["ok"] is False and res["restart_required"] is False
    assert "release wheel" in res["output"]


def test_apply_without_uv_is_a_clear_error(monkeypatch):
    monkeypatch.setattr(updater, "find_uv", lambda: None)
    res = updater.apply()
    assert res["ok"] is False
    assert "uv not found" in res["output"]


def test_every_failure_hands_back_the_manual_command(monkeypatch):
    # The AstrBot lesson: when the automatic path can't run, always tell the user
    # exactly what to type. Every failure carries the manual command.
    monkeypatch.setattr(updater, "find_uv", lambda: None)
    res = updater.apply()
    assert res["ok"] is False
    assert res["manual_command"] == updater.manual_command()
    assert updater.manual_command() in res["output"]


def test_manual_command_is_channel_aware(monkeypatch):
    monkeypatch.setattr(updater, "is_dev", lambda: False)
    assert "install.sh" in updater.manual_command()  # wheel → re-run the installer
    monkeypatch.setattr(updater, "is_dev", lambda: True)
    cmd = updater.manual_command()
    assert "git pull" in cmd and "uv sync" in cmd  # dev → pull + sync


def test_apply_dev_pulls_then_syncs(monkeypatch):
    monkeypatch.setattr(updater, "is_dev", lambda: True)
    monkeypatch.setattr(updater, "find_uv", lambda: "/fake/uv")
    monkeypatch.setattr(updater.shutil, "which", lambda n: "/usr/bin/git" if n == "git" else None)
    cmds = []
    monkeypatch.setattr(updater.subprocess, "run", lambda cmd, **kw: cmds.append(cmd) or _completed(cmd))
    res = updater.apply()
    assert res["ok"] and res["restart_required"]
    assert any("pull" in c for c in cmds) and any("sync" in c for c in cmds)


def test_apply_surfaces_a_failing_step(monkeypatch):
    monkeypatch.setattr(updater, "is_dev", lambda: False)
    monkeypatch.setattr(updater, "find_uv", lambda: "/fake/uv")
    monkeypatch.setattr(updater, "latest_wheel_url", lambda: "https://x/w.whl")
    monkeypatch.setattr(updater.subprocess, "run",
                        lambda cmd, **kw: _completed(cmd, 1, "", "boom"))
    res = updater.apply()
    assert res["ok"] is False and res["restart_required"] is False
    assert "boom" in res["output"]


def test_fetch_releases_extracts_the_wheel_asset_url(monkeypatch):
    monkeypatch.setattr(updater.shutil, "which", lambda n: None)  # no gh → HTTP path
    payload = json.dumps([{
        "tag_name": "v0.9.0", "name": "0.9.0", "body": "notes",
        "html_url": "https://h", "draft": False, "prerelease": False,
        "assets": [
            {"name": "SHA256SUMS", "browser_download_url": "https://x/SHA256SUMS"},
            {"name": "lunamoth-0.9.0-py3-none-any.whl", "browser_download_url": "https://x/w.whl"},
        ],
    }]).encode()

    class _Resp:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self): return payload
    monkeypatch.setattr(updater.urllib.request, "urlopen", lambda *a, **k: _Resp())

    rels = updater.fetch_releases()
    assert rels[0]["tag"] == "v0.9.0"
    assert rels[0]["wheel_url"] == "https://x/w.whl"  # the .whl asset, not SHA256SUMS


def test_latest_wheel_url_uses_newest_release_only(monkeypatch):
    """Aligns with status(): if the NEWEST release has no wheel, return None (apply fails
    honestly) rather than silently reaching back to an OLDER wheel than was advertised."""
    monkeypatch.setattr(updater, "fetch_releases", lambda timeout=6.0: [
        {"tag": "v0.2.0", "wheel_url": ""},                       # newest, no wheel yet
        {"tag": "v0.1.9", "wheel_url": "https://x/old.whl"},      # older, has one
    ])
    assert updater.latest_wheel_url() is None
    monkeypatch.setattr(updater, "fetch_releases", lambda timeout=6.0: [
        {"tag": "v0.2.0", "wheel_url": "https://x/new.whl"},
    ])
    assert updater.latest_wheel_url() == "https://x/new.whl"


def test_find_uv_falls_back_to_known_location(tmp_path, monkeypatch):
    import shutil as _sh

    from lunamoth.config import find_uv
    monkeypatch.setattr(_sh, "which", lambda n: None)  # not on PATH (the GUI-launch case)
    monkeypatch.setenv("LUNAMOTH_HOME", str(tmp_path))
    (tmp_path / "bin").mkdir(parents=True)
    uv = tmp_path / "bin" / "uv"
    uv.write_text("#!/bin/sh\n")
    assert find_uv() == str(uv)
