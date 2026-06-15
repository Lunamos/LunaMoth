"""Environment introspection + the audit note — small LunaMoth-kept tools.
`inspect_env` has no exact hermes twin (LunaMoth's isolation/network/presence
facts); `write_log` writes a note to the SECURITY audit trail."""
from __future__ import annotations

from ..registry import registry, tool_result


def inspect_env(args, ctx) -> str:
    """Return the live environment facts: isolation, network, writable paths,
    tool access, whether the operator is present, rest_until."""
    return tool_result(ctx.state.load())


def write_log(args, ctx) -> str:
    text = str(args.get("text") or "")
    ctx.audit.write("note", text=text[:1000])
    return tool_result(ok=True, logged=True)


registry.register(
    "inspect_env", "workspace",
    {
        "description": "Inspect your current environment: isolation mode, network on/off, writable paths, who is present, and whether you are resting.",
        "parameters": {"type": "object", "properties": {}},
    },
    inspect_env, emoji="🔎",
)

registry.register(
    "write_log", "workspace",
    {
        "description": "Write a short note to your own audit log (for your records; not shown to the user).",
        "parameters": {
            "type": "object",
            "properties": {"text": {"type": "string", "description": "The note."}},
            "required": ["text"],
        },
    },
    write_log, emoji="📝",
)
