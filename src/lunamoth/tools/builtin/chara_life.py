"""Chara-life tools — LunaMoth's own, with no hermes counterpart: speak, rest,
wish (add/set — the renamed "goal"), request_permission. These are what make a
chara a living being rather than a workhorse; they stay through the hermes-tool
migration.

`wish` (愿望) is deliberately NOT hermes' `todo`: todo is a forced task-completion
list; a wish is what the character LIVES FOR — its own aspiration, never forced.
"""
from __future__ import annotations

import time
from pathlib import Path

from ..registry import registry, tool_error, tool_result

_MIN_PERMISSION_WAIT = 5
_MAX_PERMISSION_WAIT = 300
_MAX_MEMORY_CHARS = 64_000
PERMISSION_KINDS = ("network", "writable_path", "memory", "other")
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


# ---- wish (the renamed "goal") ----------------------------------------------------

def add_wish(args, ctx) -> str:
    """Record a wish — something you live for, not a task someone set you."""
    if ctx.wishes is None:
        return tool_error("wishes not available")
    text = str(args.get("text") or "").strip()
    if not text:
        return tool_error("a wish needs `text`")
    wish = ctx.wishes.add(text, by="chara")
    return tool_result(ok=True, id=wish["id"], text=wish["text"])


def set_wish_status(args, ctx) -> str:
    if ctx.wishes is None:
        return tool_error("wishes not available")
    wish_id = str(args.get("wish_id") or args.get("goal_id") or "")
    status = str(args.get("status") or "")
    if not wish_id or not status:
        return tool_error("set_wish_status needs `wish_id` and `status`")
    wish = ctx.wishes.set_status(wish_id, status)
    return tool_result(ok=True, id=wish["id"], status=wish["status"], text=wish["text"])


registry.register(
    "add_wish", "chara-life",
    {
        "description": (
            "Add a wish — something you genuinely want, that you live toward in your own "
            "time. A wish is yours; it is not a task anyone forces you to finish (for that, "
            "use the todo tool). Wishes shape how you spend unattended time."
        ),
        "parameters": {
            "type": "object",
            "properties": {"text": {"type": "string", "description": "The wish, in your own words."}},
            "required": ["text"],
        },
    },
    add_wish, emoji="✨",
)

registry.register(
    "set_wish_status", "chara-life",
    {
        "description": "Update a wish you hold: active, done (you reached it), or dropped (you let it go).",
        "parameters": {
            "type": "object",
            "properties": {
                "wish_id": {"type": "string", "description": "The wish id."},
                "status": {"type": "string", "enum": ["active", "done", "dropped"]},
            },
            "required": ["wish_id", "status"],
        },
    },
    set_wish_status, emoji="✨",
)


# ---- request_permission ----------------------------------------------------------

def request_permission(args, ctx) -> str:
    """Ask the operator for a capability/resources. Presence-gated: granted only
    while the operator is attached and answers; otherwise denied + logged."""
    kind = str(args.get("kind") or "").strip().lower()
    reason = str(args.get("reason") or "")
    detail = str(args.get("detail") or "")
    wait_seconds = args.get("wait_seconds") or 60
    if kind not in PERMISSION_KINDS:
        return tool_error(f"kind must be one of {PERMISSION_KINDS}")
    if not ctx.state.load().get("user_present", False):
        return tool_result(granted=False, note=(
            "denied: the operator is away. Requests are only considered while the operator "
            "is attached; this one was logged for them to see later."))
    if ctx.permission_hook is None:
        return tool_result(granted=False, note="denied: no operator console is available to approve requests.")
    wait = max(_MIN_PERMISSION_WAIT, min(_MAX_PERMISSION_WAIT, int(wait_seconds)))
    granted = bool(ctx.permission_hook(kind, reason, detail, wait))
    if not granted:
        return tool_result(granted=False, note="denied: the operator declined (or did not answer in time).")
    if kind == "network":
        ctx.state.set_network(True)
        return tool_result(granted=True, note="network access is now ON.")
    if kind == "writable_path":
        p = str(Path(detail).expanduser().resolve()) if detail.strip() else ""
        if not p:
            return tool_result(granted=True, note="granted in principle, but no path was given — request again with the path in `detail`.")
        ctx.state.add_writable_path(p)
        if (ctx.state.load().get("isolation") or "").lower() == "docker":
            return tool_result(granted=True, note=(
                f"recorded: {p} is on your writable list, but docker isolation does not bind-mount "
                "it — the terminal cannot write there until the container is restarted with that mount."))
        return tool_result(granted=True, note=f"{p} is now writable.")
    if kind == "memory":
        if ctx.memory is None:
            return tool_result(granted=True, note="granted, but no memory store is attached.")
        from ..memory import MemoryLimits
        limits = ctx.memory.limits
        new_chars = min(_MAX_MEMORY_CHARS, limits.memory_chars * 2)
        ctx.memory.set_limits(MemoryLimits(memory_chars=new_chars, user_chars=limits.user_chars))
        return tool_result(granted=True, note=f"memory budget raised to {new_chars} chars.")
    return tool_result(granted=True, note="The operator will act on it.")


registry.register(
    "request_permission", "chara-life",
    {
        "description": (
            "Ask your operator for a capability or more resources (network access, a "
            "writable path, a bigger memory budget). Only considered while they are "
            "present; if they are away it is denied and logged for them to see."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": list(PERMISSION_KINDS)},
                "reason": {"type": "string", "description": "Why you need it (the operator sees this)."},
                "detail": {"type": "string", "description": "e.g. the path for writable_path."},
                "wait_seconds": {"type": "integer", "description": "How long to wait for an answer (5–300)."},
            },
            "required": ["kind", "reason"],
        },
    },
    request_permission, emoji="⚿",
)
