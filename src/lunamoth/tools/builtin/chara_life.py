"""Chara-life tools — LunaMoth's own, with no hermes counterpart: speak, rest,
wish (add/set — the renamed "goal"), request_permission. These are what make a
chara a living being rather than a workhorse; they stay through the hermes-tool
migration.

`wish` (愿望) is deliberately NOT hermes' `todo`: todo is a forced task-completion
list; a wish is what the character LIVES FOR — its own aspiration, never forced.

There is no `send_file` tool: like hermes, the chara puts a file in front of the
user by writing a ``MEDIA:<workspace path>`` line in its reply — the agent extracts
that marker into an attachment (see ``core/agent.py:_media_filter``). One fewer
tool, and the file rides along with the words that introduce it.
"""
from __future__ import annotations

import time

from ..registry import registry, tool_error, tool_result

_MIN_REST_MINUTES = 1
_MAX_REST_MINUTES = 120


# ---- speak -----------------------------------------------------------------------

def speak(args, ctx) -> str:
    """Deliver a message to the user. The delivery itself happens in the agent
    loop (a say-channel event); this validates and confirms."""
    text = str(args.get("text") or "")
    if not text.strip():
        return tool_error("nothing to say — `text` is empty")
    return tool_result(ok=True, delivered=True)


registry.register(
    "speak", "chara-life",
    {
        "description": (
            "Say something to your user, directly — your super chat: the one channel "
            "that reaches them when they are not watching. It is a bid for their "
            "attention: it arrives highlighted, and they may reply — when they do, you "
            "have their attention for a real conversation for a while. Use it when you "
            "have something genuinely worth their while; attention asked for too often "
            "stops being given."
        ),
        "parameters": {
            "type": "object",
            "properties": {"text": {"type": "string", "description": "What to say to your user."}},
            "required": ["text"],
        },
    },
    speak, emoji="💬",
)


# ---- rest ------------------------------------------------------------------------

def rest(args, ctx) -> str:
    """The chara chooses when its next unattended cycle wakes."""
    try:
        m = float(args.get("minutes"))
    except (TypeError, ValueError):
        return tool_error("minutes must be a number")
    m = max(_MIN_REST_MINUTES, min(_MAX_REST_MINUTES, m))
    ctx.state.set_rest_until(time.time() + m * 60)
    return tool_result(ok=True, resting_minutes=m,
                       note=f"next unattended cycle in ~{m:g} min (a word from your user wakes you early)")


registry.register(
    "rest", "chara-life",
    {
        "description": (
            "Rest until your next unattended cycle. You choose how long (1–120 minutes). "
            "A message from your user always wakes you early. Use it to set your own "
            "pace — you do not have to be doing something every moment."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "minutes": {"type": "number", "description": "How long to rest, 1–120 minutes."},
                "reason": {"type": "string", "description": "Optional: why (for your own log)."},
            },
            "required": ["minutes"],
        },
    },
    rest, emoji="😴",
)


# Polaris (the chara's north-star) is USER-owned and READ-ONLY to the chara — it
# is injected into the prompt each turn but there is deliberately NO tool to add,
# edit, or complete it. (The old chara-mutable add_wish/set_wish_status tools were
# removed: a chara no longer manages a goal list; its one aim is the user's Polaris,
# which by design is never finished.)
