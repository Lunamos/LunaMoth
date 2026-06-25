"""Discord + Slack adapter tests — parse, outbound target resolution, and the
gateway/socket protocol _handle (driven with a fake WebSocket). No network."""
from __future__ import annotations

import asyncio
import json
import queue

import pytest

from lunamoth.messaging.base import DeliveryDeferred, InboundMessage
from lunamoth.messaging.discord import (
    INTENTS,
    DiscordAdapter,
    parse_message_create,
)
from lunamoth.messaging.gateway import make_adapters
from lunamoth.messaging.slack import SlackAdapter, parse_event


class _FakeResp:
    def __init__(self, body: bytes) -> None:
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *_a):
        return False


class _RecordingOpener:
    """A urlopen-compatible stub: records each Request, returns a canned body."""

    def __init__(self, body: bytes = b"{}") -> None:
        self.calls: list = []
        self.body = body

    def __call__(self, req, timeout=None):
        self.calls.append(req)
        return _FakeResp(self.body)


class _FakeWS:
    def __init__(self) -> None:
        self.sent: list[str] = []
        self.closed = False

    async def send(self, data: str) -> None:
        self.sent.append(data)

    async def close(self, code: int = 1000) -> None:
        self.closed = True


# ----------------------------------------------------------------------------- Discord

def test_discord_intents_are_messages_dms_and_content():
    # GUILD_MESSAGES(512) | DIRECT_MESSAGES(4096) | MESSAGE_CONTENT(32768)
    assert INTENTS == 512 + 4096 + 32768


def test_discord_parse_dm_message():
    m = parse_message_create(
        {"id": "100", "channel_id": "c1", "content": "hello there", "author": {"id": "u1", "username": "Alice"}},
        bot_user_id="bot",
    )
    assert m is not None
    assert m.sender_id == "u1" and m.sender_name == "Alice"
    assert m.text == "hello there" and m.reply == {"channel_id": "c1"} and m.message_id == "100"


def test_discord_ignores_self_and_other_bots():
    assert parse_message_create({"channel_id": "c", "content": "x", "author": {"id": "bot"}}, "bot") is None
    assert parse_message_create({"channel_id": "c", "content": "x", "author": {"id": "u2", "bot": True}}, "bot") is None
    assert parse_message_create(
        {"channel_id": "c", "content": "x", "author": {"id": "u2", "bot": True}}, "bot", allow_bot=True
    ) is not None


def test_discord_guild_requires_mention_and_strips_it():
    base = {"channel_id": "c", "guild_id": "g", "author": {"id": "u1"}}
    assert parse_message_create({**base, "content": "hi", "mentions": []}, "bot") is None
    m = parse_message_create({**base, "content": "<@bot> hi there", "mentions": [{"id": "bot"}]}, "bot")
    assert m is not None and m.text == "hi there"


def test_discord_empty_content_ignored():
    assert parse_message_create({"channel_id": "c", "content": "  ", "author": {"id": "u1"}}, "bot") is None


def test_discord_send_target_resolution_and_post_shape():
    opener = _RecordingOpener(b"{}")
    a = DiscordAdapter({"bot_token": "tok", "channel_id": "default"}, opener=opener)
    a.send("hi")  # no inbound → the configured default channel
    req = opener.calls[-1]
    assert req.full_url.endswith("/channels/default/messages")
    assert json.loads(req.data)["content"] == "hi"
    assert req.get_header("Authorization") == "Bot tok"

    a.set_reply_target(InboundMessage("u1", "Alice", "x", reply={"channel_id": "c9"}))
    a.send("yo")  # a reply targets the inbound channel
    assert opener.calls[-1].full_url.endswith("/channels/c9/messages")

    a.clear_reply_target()
    a.send("after")  # falls back to the last seen channel
    assert opener.calls[-1].full_url.endswith("/channels/c9/messages")


def test_discord_send_without_target_defers():
    a = DiscordAdapter({"bot_token": "tok"}, opener=_RecordingOpener())
    with pytest.raises(DeliveryDeferred):
        a.send("hi")


def test_discord_send_image_posts_url_as_text():
    opener = _RecordingOpener(b"{}")
    a = DiscordAdapter({"bot_token": "t", "channel_id": "c"}, opener=opener)
    a.send_image("https://x/y.png", caption="look")
    body = json.loads(opener.calls[-1].data)["content"]
    assert "https://x/y.png" in body and "look" in body


def test_discord_handle_ready_then_message_create():
    a = DiscordAdapter({"bot_token": "t"}, opener=_RecordingOpener())
    inbox: queue.Queue = queue.Queue()
    ws = _FakeWS()
    asyncio.run(a._handle(
        {"op": 0, "t": "READY", "s": 1,
         "d": {"session_id": "s", "user": {"id": "bot", "username": "Q"}, "resume_gateway_url": "wss://r"}},
        ws, inbox))
    assert a._bot_user_id == "bot" and a._session_id == "s" and a._seq == 1
    assert a._resume_url == "wss://r?v=10&encoding=json"

    asyncio.run(a._handle(
        {"op": 0, "t": "MESSAGE_CREATE", "s": 2,
         "d": {"id": "10", "channel_id": "c1", "content": "hi", "author": {"id": "u1", "username": "A"}}},
        ws, inbox))
    m = inbox.get_nowait()
    assert m.text == "hi" and a._last_channel == "c1" and a._seq == 2


def test_discord_handle_reconnect_and_invalid_session():
    a = DiscordAdapter({"bot_token": "t"}, opener=_RecordingOpener())
    a._session_id, a._seq = "sess", 5
    ws = _FakeWS()
    assert asyncio.run(a._handle({"op": 7}, ws, queue.Queue())) is False and ws.closed
    # a non-resumable invalid session wipes the session so the next connect re-IDENTIFYs
    ws2 = _FakeWS()
    assert asyncio.run(a._handle({"op": 9, "d": False}, ws2, queue.Queue())) is False
    assert a._session_id == "" and a._seq is None


# ------------------------------------------------------------------------------- Slack

def test_slack_parse_dm_and_app_mention():
    m = parse_event(
        {"event_id": "E1", "event": {"type": "message", "channel_type": "im",
                                     "channel": "D1", "user": "U1", "text": "hello", "ts": "1"}},
        "BOT")
    assert m is not None and m.sender_id == "U1" and m.text == "hello"
    assert m.reply == {"channel": "D1"} and m.message_id == "E1"

    m2 = parse_event(
        {"event": {"type": "app_mention", "channel": "C1", "user": "U1", "text": "<@BOT> hey", "ts": "2"}},
        "BOT")
    assert m2 is not None and m2.text == "hey"


def test_slack_ignores_bot_subtype_self_and_plain_channel():
    # a plain channel message (not a DM, no app_mention) is ignored
    assert parse_event({"event": {"type": "message", "channel_type": "channel",
                                  "channel": "C", "user": "U1", "text": "x"}}, "BOT") is None
    # a bot, an edit subtype, and our own messages are all ignored
    assert parse_event({"event": {"type": "message", "channel_type": "im",
                                  "channel": "D", "user": "U1", "bot_id": "B", "text": "x"}}, "BOT") is None
    assert parse_event({"event": {"type": "message", "channel_type": "im", "channel": "D",
                                  "subtype": "message_changed", "user": "U1", "text": "x"}}, "BOT") is None
    assert parse_event({"event": {"type": "message", "channel_type": "im",
                                  "channel": "D", "user": "BOT", "text": "x"}}, "BOT") is None


def test_slack_send_posts_chat_postmessage():
    opener = _RecordingOpener(b'{"ok": true}')
    a = SlackAdapter({"bot_token": "xoxb-t", "app_token": "xapp-a", "channel_id": "D9"}, opener=opener)
    a.send("hello")
    req = opener.calls[-1]
    assert req.full_url.endswith("/chat.postMessage")
    assert json.loads(req.data) == {"channel": "D9", "text": "hello"}
    assert req.get_header("Authorization") == "Bearer xoxb-t"


def test_slack_send_without_channel_defers():
    a = SlackAdapter({"bot_token": "x", "app_token": "y"}, opener=_RecordingOpener(b'{"ok": true}'))
    with pytest.raises(DeliveryDeferred):
        a.send("hi")


def test_slack_handle_acks_envelope_first_then_enqueues():
    a = SlackAdapter({"bot_token": "x", "app_token": "y"}, opener=_RecordingOpener(b'{"ok": true}'))
    a._bot_user_id = "BOT"
    inbox: queue.Queue = queue.Queue()
    ws = _FakeWS()
    asyncio.run(a._handle(
        {"type": "events_api", "envelope_id": "env1",
         "payload": {"event_id": "E", "event": {"type": "message", "channel_type": "im",
                                                "channel": "D1", "user": "U1", "text": "hi", "ts": "1"}}},
        ws, inbox))
    assert json.loads(ws.sent[-1]) == {"envelope_id": "env1"}  # ACK sent
    m = inbox.get_nowait()
    assert m.text == "hi" and a._last_channel == "D1"


def test_slack_disconnect_drops_link():
    a = SlackAdapter({"bot_token": "x", "app_token": "y"}, opener=_RecordingOpener(b'{"ok": true}'))
    assert asyncio.run(a._handle({"type": "disconnect", "reason": "refresh_requested"}, _FakeWS(), queue.Queue())) is False


# ------------------------------------------------------------------------- registration

def test_make_adapters_builds_discord_and_slack():
    cfg = {"adapters": {
        "discord": {"enabled": True, "bot_token": "tok", "owner_id": "o1", "channel_id": "c1"},
        "slack": {"enabled": True, "bot_token": "xoxb-x", "app_token": "xapp-y"},
    }}
    names = sorted(a.name for a in make_adapters(cfg))
    assert names == ["discord", "slack"]


def test_make_adapters_rejects_unknown_platform():
    with pytest.raises(ValueError):
        make_adapters({"adapters": {"myspace": {"enabled": True}}})


def test_discord_missing_token_is_a_clear_error():
    with pytest.raises(ValueError):
        DiscordAdapter({})


def test_slack_needs_both_tokens():
    with pytest.raises(ValueError):
        SlackAdapter({"bot_token": "xoxb-only"})
