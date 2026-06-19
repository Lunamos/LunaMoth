"""EnvState.permissions(): the single typed snapshot of (isolation, network,
writable_paths) that every tool runner reads, so the facts can't drift between
the foreground, background, and PTY paths."""
from __future__ import annotations

from lunamoth.core.state import EnvState, Permissions


def test_permissions_reflects_state_and_defaults(tmp_path):
    st = EnvState(tmp_path / "env.json")
    perms = st.permissions()
    assert isinstance(perms, Permissions)
    # Defaults: jailed + network ON (owner 2026-06-15) + no extra writable paths.
    assert perms.isolation == "sandbox"
    assert perms.network_on is True
    assert perms.writable_paths == []


def test_permissions_tracks_mutations(tmp_path):
    st = EnvState(tmp_path / "env.json")
    st.set_network(False)
    st.add_writable_path("/tmp/extra")
    perms = st.permissions()
    assert perms.network_on is False
    assert "/tmp/extra" in perms.writable_paths


def test_permissions_is_an_immutable_snapshot(tmp_path):
    st = EnvState(tmp_path / "env.json")
    perms = st.permissions()
    # frozen dataclass — a consumer can't accidentally mutate shared state.
    import dataclasses
    try:
        perms.network_on = False  # type: ignore[misc]
        raised = False
    except dataclasses.FrozenInstanceError:
        raised = True
    assert raised
