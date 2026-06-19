"""The browser-specific OS jail (session/isolation.py, browser=True).

A real Chromium needs more latitude than the deny-default shell profile, so the
browser path uses an inverted jail: permissive by default, but with writes
confined to the workspace (+ the temp dirs the browser scratches in) and the
secret home (~/.lunamoth) unreadable. Validated end-to-end on macOS 2026-06-19
(agent-browser + system Chrome under sandbox-exec). These unit tests exercise the
argv/profile BUILDERS directly, so they run on any platform without a real jail.
"""
from __future__ import annotations

from lunamoth.session import isolation


# ---- macOS Seatbelt profile -------------------------------------------------

def test_macos_browser_profile_confines_writes_and_hides_secret(tmp_path):
    ws = tmp_path / "workspace"
    ws.mkdir()
    prof = isolation._macos_profile(ws, True, [], browser=True)
    # Inverted: allow-by-default so Chromium gets iokit/posix-shm/mach latitude.
    assert "(allow default)" in prof
    # ...but the secret home is unreadable and the workspace re-allowed over it.
    assert f'(deny file-read* (subpath "{isolation._lunamoth_home()}"))' in prof
    assert f'(allow file-read* (subpath "{ws}"))' in prof
    # ...and writes are confined: deny-all then re-allow workspace + the temp
    # dirs Chrome's user-data-dir / ProcessSingleton socket / agent-browser
    # socket land in.
    assert "(deny file-write*)" in prof
    assert f'(allow file-write* (subpath "{ws}"))' in prof
    assert isolation._darwin_user_temp() in prof
    assert "/private/tmp" in prof


def test_macos_browser_profile_net_off_denies_network(tmp_path):
    ws = tmp_path / "workspace"
    ws.mkdir()
    assert "(deny network*)" in isolation._macos_profile(ws, False, [], browser=True)
    assert "(deny network*)" not in isolation._macos_profile(ws, True, [], browser=True)


def test_macos_shell_profile_unchanged_deny_default(tmp_path):
    ws = tmp_path / "workspace"
    ws.mkdir()
    prof = isolation._macos_profile(ws, True, [], browser=False)
    assert "(deny default)" in prof
    assert "(allow default)" not in prof


# ---- Linux bwrap argv -------------------------------------------------------

def test_linux_browser_jail_preserves_daemon_and_hides_secret(tmp_path):
    ws = tmp_path / "workspace"
    ws.mkdir()
    argv = isolation._linux_jail_argv(["/bin/bash", "-c", "x"], ws, True, [], browser=True)
    # The browser daemon must outlive a single call → NO --die-with-parent.
    assert "--die-with-parent" not in argv
    # Whole root readable (node/chromium/agent-browser live all over the host).
    assert "--ro-bind" in argv
    # Secret home hidden by an empty tmpfs, workspace re-bound rw over it.
    assert "--tmpfs" in argv
    assert str(isolation._lunamoth_home()) in argv
    assert str(ws) in argv


def test_linux_landlock_browser_grants_proc(tmp_path):
    # Chrome's renderer FATALs without full /proc (opendir /proc/self/fd) under
    # Landlock — the browser variant must grant rw /proc + /sys + /dev/shm.
    ws = tmp_path / "workspace"
    ws.mkdir()
    argv = isolation._linux_landlock_argv(["/bin/bash", "-c", "x"], ws, True, [], browser=True)
    s = " ".join(argv)
    assert "--rw /proc" in s
    assert "--rw /sys" in s
    assert "--rw /dev/shm" in s
    assert "--rw /tmp" in s
    # The non-browser landlock jail does NOT grant /proc.
    shell = isolation._linux_landlock_argv(["/bin/bash", "-c", "x"], ws, True, [], browser=False)
    assert "--rw /proc" not in " ".join(shell)


def test_linux_shell_jail_keeps_die_with_parent(tmp_path):
    ws = tmp_path / "workspace"
    ws.mkdir()
    argv = isolation._linux_jail_argv(["/bin/bash", "-c", "x"], ws, True, [], browser=False)
    assert "--die-with-parent" in argv
    # The shell jail does NOT bind the whole root (only system dirs).
    assert not (argv.count("--ro-bind") and "/" in argv[argv.index("--ro-bind") + 1:argv.index("--ro-bind") + 2])
