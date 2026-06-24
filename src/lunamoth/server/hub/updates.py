"""Software update + changelog — coupled to GitHub Releases (the mature, standard way).

We READ the repo's GitHub Releases (tag + markdown notes) as both the changelog and the
latest-version signal, and APPLY via the SAME channel-aware steps as ``lunamoth update``:
a dev/git checkout = ``git pull --ff-only`` + ``uv sync``; a wheel install = ``uv tool
upgrade lunamoth``. We only ever CHECK + surface — never auto-update, never default-update.

The release fetch is cached (GitHub's unauthenticated rate limit is 60/hr) in the same
``update_check.json`` stamp the CLI already uses, extended with the release list.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from ... import __version__
from ...session import sessions as S

_APP_DIR = Path(__file__).resolve().parents[4]  # repo checkout (dev) / install dir
_REPO = "Lunamos/LunaMoth"  # owner/repo for the Releases API
_RELEASES_PATH = f"repos/{_REPO}/releases?per_page=10"
_RELEASES_API = f"https://api.github.com/{_RELEASES_PATH}"
_CACHE_TTL = 3600.0  # GitHub unauth limit is 60/hr — cache the release fetch
_TIMEOUT = 6.0
_APPLY_TIMEOUT = 300.0


def _stamp_path() -> Path:
    return S.lunamoth_home() / "update_check.json"


def _is_dev() -> bool:
    return (_APP_DIR / ".git").exists()


def _norm(v: str) -> tuple[int, ...]:
    """A version tag → comparable tuple: 'v0.1.1' / '0.1.1' → (0, 1, 1)."""
    parts = []
    for seg in str(v or "").strip().lstrip("vV").split("."):
        digits = "".join(ch for ch in seg if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts) or (0,)


def _fetch_via_gh() -> Any:
    """The GitHub CLI when present: authenticated, no anonymous rate limit, and it
    transparently handles a private repo. Returns parsed JSON or None if gh is absent."""
    gh = shutil.which("gh")
    if not gh:
        return None
    p = subprocess.run([gh, "api", _RELEASES_PATH], capture_output=True, text=True, timeout=_TIMEOUT)
    if p.returncode != 0:
        return None
    return json.loads(p.stdout)


def _fetch_via_http() -> Any:
    req = urllib.request.Request(
        _RELEASES_API,
        headers={"Accept": "application/vnd.github+json", "User-Agent": "lunamoth"},
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:  # noqa: S310 - fixed GitHub URL
        return json.loads(r.read().decode("utf-8"))


def _fetch_releases() -> list[dict[str, Any]]:
    data = _fetch_via_gh()  # authed, rate-limit-free when available
    if data is None:
        data = _fetch_via_http()  # public-repo fallback (60/hr unauth, cached hourly)
    out: list[dict[str, Any]] = []
    for rel in data if isinstance(data, list) else []:
        if not isinstance(rel, dict) or rel.get("draft"):
            continue
        out.append({
            "tag": str(rel.get("tag_name") or ""),
            "name": str(rel.get("name") or rel.get("tag_name") or ""),
            "body": str(rel.get("body") or ""),
            "published_at": str(rel.get("published_at") or ""),
            "url": str(rel.get("html_url") or ""),
            "prerelease": bool(rel.get("prerelease")),
        })
    return out


def _commits_behind() -> int | None:
    """Dev channel only: commits on origin/main beyond HEAD (a checkout can be behind
    main without a tagged release). None when not a git checkout / git is unreachable."""
    git = shutil.which("git")
    if not git or not _is_dev():
        return None
    try:
        subprocess.run([git, "-C", str(_APP_DIR), "fetch", "--quiet", "origin", "main"],
                       timeout=_TIMEOUT, check=True, capture_output=True)
        out = subprocess.run([git, "-C", str(_APP_DIR), "rev-list", "--count", "HEAD..origin/main"],
                             timeout=_TIMEOUT, check=True, capture_output=True, text=True)
        return int(out.stdout.strip())
    except Exception:  # noqa: BLE001 - fail silent, the check is best-effort
        return None


def _read_stamp() -> dict[str, Any]:
    try:
        data = json.loads(_stamp_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _write_stamp(data: dict[str, Any]) -> None:
    try:
        S.lunamoth_home().mkdir(parents=True, exist_ok=True)
        _stamp_path().write_text(json.dumps(data), encoding="utf-8")
    except OSError:
        pass


def status(force: bool = False) -> dict[str, Any]:
    """Current version + channel + latest release + changelog (release notes). Cached for
    an hour unless ``force``; a fetch failure falls back to the cached releases."""
    cached = _read_stamp()
    fresh = (time.time() - float(cached.get("checked_at") or 0)) < _CACHE_TTL
    if fresh and not force and "releases" in cached:
        releases = cached.get("releases") or []
        behind = cached.get("behind")
    else:
        try:
            releases = _fetch_releases()
        except (urllib.error.URLError, OSError, ValueError, TimeoutError,
                subprocess.TimeoutExpired):
            releases = cached.get("releases") or []  # offline / rate-limited → keep last known
        behind = _commits_behind()
        _write_stamp({"t": time.time(), "checked_at": time.time(),
                      "behind": behind if behind is not None else cached.get("behind", 0),
                      "releases": releases})
    channel = "dev" if _is_dev() else "wheel"
    latest = releases[0]["tag"] if releases else ""
    newer_tag = bool(latest) and _norm(latest) > _norm(__version__)
    update_available = (bool(behind and behind > 0) or newer_tag) if channel == "dev" else newer_tag
    return {
        "current": __version__,
        "channel": channel,
        "latest": latest,
        "behind": int(behind) if behind is not None else 0,
        "update_available": update_available,
        "releases": releases,
        "checked_at": _read_stamp().get("checked_at") or time.time(),
    }


def apply() -> dict[str, Any]:
    """Run the channel-aware in-place update. BLOCKING (callers run it off the event loop).
    Returns ``{ok, output, restart_required}`` — the running process keeps the OLD code
    until it restarts, so the UI tells the user to restart."""
    uv = shutil.which("uv") or "uv"
    if _is_dev():
        git = shutil.which("git")
        if not git:
            return {"ok": False, "output": "git not found", "restart_required": False}
        steps = [[git, "-C", str(_APP_DIR), "pull", "--ff-only", "origin", "main"],
                 [uv, "sync", "--project", str(_APP_DIR)]]
    else:
        steps = [[uv, "tool", "upgrade", "lunamoth"]]
    log: list[str] = []
    for cmd in steps:
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=_APPLY_TIMEOUT)
        except (subprocess.TimeoutExpired, OSError) as e:
            log.append(f"$ {' '.join(map(str, cmd))}\n{e}")
            return {"ok": False, "output": "\n".join(log), "restart_required": False}
        log.append(f"$ {' '.join(map(str, cmd))}\n{(p.stdout or '') + (p.stderr or '')}".strip())
        if p.returncode != 0:
            return {"ok": False, "output": "\n".join(log), "restart_required": False}
    # Force a fresh check on next status() (clear the cache age), keep last release list.
    _write_stamp({"t": time.time(), "checked_at": 0, "behind": 0,
                  "releases": _read_stamp().get("releases", [])})
    return {"ok": True, "output": "\n".join(log), "restart_required": True}
