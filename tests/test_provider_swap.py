"""A /provider or /model swap must strip stale cross-provider reasoning continuity.

reasoning_details (Anthropic/Gemini signed thinking blocks) and per-tool-call
extra_content are opaque to any route that didn't emit them; render() replays
reasoning_details unconditionally, so without a strip on swap a cross-provider
switch poisons every later turn (a strict endpoint can 400 on the foreign field).
"""
from __future__ import annotations

import pytest

from lunamoth.session.settings import Settings


@pytest.fixture
def agent(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("LUNAMOTH_CONFIG_DIR", str(tmp_path / "cfg"))
    monkeypatch.setenv("LUNAMOTH_HOME", str(tmp_path / "home"))
    from lunamoth.core import agent as agent_mod

    monkeypatch.setattr(agent_mod, "SANDBOX_ROOT", tmp_path / "sandbox")
    from lunamoth.core.agent import LunaMothAgent

    a = LunaMothAgent(Settings(provider="mock", character_path="", toolpack=""))
    a.transcript.reset()
    return a


def _seed_continuity(session) -> None:
    session.context.messages[:] = [
        {"role": "user", "content": "hi"},
        {
            "role": "assistant",
            "content": "hello",
            "reasoning_details": [{"type": "reasoning.encrypted", "data": "xx"}],
            "tool_calls": [{
                "id": "c1", "type": "function",
                "function": {"name": "terminal", "arguments": "{}"},
                "extra_content": {"thought_signature": "sig"},
            }],
        },
        {"role": "tool", "tool_call_id": "c1", "content": "ok"},
    ]


def _assert_stripped(session) -> None:
    asst = session.context.messages[1]
    assert "reasoning_details" not in asst
    assert "extra_content" not in asst["tool_calls"][0]
    # The plain content / tool-call structure is otherwise untouched.
    assert asst["content"] == "hello"
    assert asst["tool_calls"][0]["id"] == "c1"


def test_swap_provider_strips_reasoning_continuity(agent):
    session = agent.make_session()
    _seed_continuity(session)
    agent.swap_provider(provider="openai_compatible",
                        base_url="https://api.example/v1", api_key="sk-x",
                        model="some-model", session=session)
    _assert_stripped(session)


def test_swap_model_strips_reasoning_continuity(agent):
    session = agent.make_session()
    _seed_continuity(session)
    agent.swap_model("another-model", session=session)
    _assert_stripped(session)
