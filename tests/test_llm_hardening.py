"""Hermes-parity hardening of the streaming client (audit #2/#7/#8/#9):
tool-args JSON repair, lone-surrogate scrubbing, real usage capture, and the
announced step-budget exhaustion. All offline — fake streams, no sleeps."""
import json

from lunamoth.config import LLMConfig
from lunamoth.core.llm import LLMClient, _repair_tool_args


def _client():
    return LLMClient(LLMConfig(provider="openai_compatible", base_url="https://x.test/v1", model="m"))


def _drive(gen):
    """Drive a generator that returns a value; collect (events, return value)."""
    events = []
    try:
        while True:
            events.append(next(gen))
    except StopIteration as stop:
        return events, stop.value


# ---- audit #2: tool-call argument repair -------------------------------------------------


def test_valid_args_pass_byte_identical():
    raw = '{"a":  1, "路径": "工坊/诗.txt"}'  # odd spacing + CJK must survive untouched
    assert _repair_tool_args(raw, "t") == raw


def test_trailing_comma_stripped():
    fixed = _repair_tool_args('{"a": 1,}', "t")
    assert json.loads(fixed) == {"a": 1}


def test_unclosed_structures_closed():
    fixed = _repair_tool_args('{"a": [1, 2', "t")
    assert json.loads(fixed) == {"a": [1, 2]}


def test_excess_closers_popped():
    fixed = _repair_tool_args('{"a": 1}}}', "t")
    assert json.loads(fixed) == {"a": 1}


def test_literal_control_chars_reserialized():
    # strict=False accepts a literal tab inside a string (hermes #12068, the
    # most common local-model case) and re-serializes to wire-valid JSON.
    fixed = _repair_tool_args('{"a": "x\ty"}', "t")
    assert json.loads(fixed) == {"a": "x\ty"}
    assert "\t" not in fixed


def test_control_chars_plus_structural_damage():
    # Pass 3: control chars combined with an unclosed brace.
    fixed = _repair_tool_args('{"a": "x\ny", "b": 1', "t")
    assert json.loads(fixed) == {"a": "x\ny", "b": 1}


def test_python_none_and_empty_become_empty_object():
    assert _repair_tool_args("None", "t") == "{}"
    assert _repair_tool_args("", "t") == "{}"
    assert _repair_tool_args("   ", "t") == "{}"


def test_unrepairable_garbage_degrades_to_empty_object():
    # "{}" feeds the gateway's honest missing-args error instead of crashing.
    assert _repair_tool_args("<<<not json>>>", "t") == "{}"


def test_cjk_survives_reserialization():
    fixed = _repair_tool_args('{"text": "你好\t世界"}', "t")
    assert json.loads(fixed) == {"text": "你好\t世界"}
    assert "你好" in fixed  # ensure_ascii=False — no \uXXXX token bloat


def test_replayed_history_args_repaired_without_mutating_context():
    broken = {"role": "assistant", "content": "", "tool_calls": [
        {"id": "c1", "type": "function", "function": {"name": "terminal", "arguments": '{"command": "ls",'}},
    ]}
    context = [broken, {"role": "tool", "tool_call_id": "c1", "content": "ok"}]
    messages = _client()._messages("hi", context, ["sys"], [])
    sent = next(m for m in messages if m.get("tool_calls"))
    assert json.loads(sent["tool_calls"][0]["function"]["arguments"]) == {"command": "ls"}
    # The durable history is untouched: copy-on-repair, per-request view only.
    assert broken["tool_calls"][0]["function"]["arguments"] == '{"command": "ls",'


def test_replayed_valid_args_stay_byte_identical():
    raw = '{"a": 1}'
    msg = {"role": "assistant", "content": "", "tool_calls": [
        {"id": "c1", "type": "function", "function": {"name": "t", "arguments": raw}},
    ]}
    messages = _client()._messages("hi", [msg], ["sys"], [])
    sent = next(m for m in messages if m.get("tool_calls"))
    assert sent["tool_calls"][0]["function"]["arguments"] is raw  # not even copied


# ---- fake SSE stream harness -------------------------------------------------------------


class FakeResp:
    def __init__(self, lines):
        self._lines = list(lines)

    def __iter__(self):
        return iter(self._lines)

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _patch_stream(monkeypatch, chunks):
    lines = [b"data: " + json.dumps(c).encode("utf-8") for c in chunks] + [b"data: [DONE]"]

    def fake_connect(self, url, data, timeout):
        return FakeResp(lines)
        yield  # pragma: no cover — generator for `yield from`

    monkeypatch.setattr(LLMClient, "_connect_with_retry", fake_connect)


def test_stream_end_args_repair(monkeypatch):
    _patch_stream(monkeypatch, [
        {"choices": [{"delta": {"tool_calls": [
            {"index": 0, "id": "c1", "function": {"name": "terminal", "arguments": '{"command": "ls"'}},
        ]}}]},
        {"choices": [{"finish_reason": "tool_calls", "delta": {}}]},
    ])
    out: list = []
    _events, (tool_calls, _think, finish) = _drive(_client()._stream_turn([], None, out))
    assert finish == "tool_calls"
    assert json.loads(tool_calls[0]["function"]["arguments"]) == {"command": "ls"}
