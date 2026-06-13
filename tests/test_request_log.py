"""The faithful per-turn request log: SANDBOX_ROOT/logs/requests.jsonl.

Always on, capped at the last 200 records, best-effort (never raises). The
content must be the EXACT system + messages + tools that the request used.
"""
import json

import pytest

from lunamoth.session.settings import Settings


@pytest.fixture
def agent(tmp_path, monkeypatch):
    # SANDBOX_ROOT pins at import — set env BEFORE importing the runtime module.
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("LUNAMOTH_SANDBOX", str(tmp_path / "sandbox"))
    monkeypatch.setenv("LUNAMOTH_CONFIG_DIR", str(tmp_path / "cfg"))
    from lunamoth.core.agent import LunaMothAgent

    def make(**kw):
        kw.setdefault("toolpack", "")
        return LunaMothAgent(Settings(character_path="", **kw))

    return make


def _requests_path():
    from lunamoth.config import SANDBOX_ROOT

    return SANDBOX_ROOT / "logs" / "requests.jsonl"


def test_handle_logs_a_faithful_request(agent):
    a = agent()
    a.transcript.reset()  # SANDBOX_ROOT is import-time global; isolate
    path = _requests_path()
    if path.exists():
        path.unlink()
    s = a.make_session()
    a.handle("hello there", s)
    assert path.exists()
    lines = [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines()]
    rec = lines[-1]
    assert rec["kind"] == "send"
    assert rec["model"] == a.settings.model
    assert isinstance(rec["system"], list) and rec["system"]  # stable+volatile strings
    assert all(isinstance(s2, str) for s2 in rec["system"])
    # The messages are the SAME render view the request used (the operator's
    # line is in there).
    assert any(m.get("role") == "user" and "hello there" in str(m.get("content", ""))
               for m in rec["messages"])
    assert isinstance(rec["tools"], list)
    assert "ts" in rec


def test_request_log_caps_at_200_lines(agent):
    from lunamoth.core import agent as agent_mod

    path = _requests_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    for i in range(250):
        agent_mod._append_request_log("send", [f"sys{i}"], [{"role": "user", "content": str(i)}], [], "m")
    lines = path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 200
    # The OLDEST were dropped: the window holds 50..249.
    first = json.loads(lines[0])
    last = json.loads(lines[-1])
    assert first["messages"][0]["content"] == "50"
    assert last["messages"][0]["content"] == "249"


def test_request_log_never_raises(agent, monkeypatch):
    from lunamoth.core import agent as agent_mod

    # A non-serializable payload must be swallowed, not raised.
    agent_mod._append_request_log("send", ["sys"], [{"role": "user", "content": object()}], [], "m")
