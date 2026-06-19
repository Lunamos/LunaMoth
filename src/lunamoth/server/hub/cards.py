"""Cards: CRUD, AI drafting, per-field rewrite, avatars & art-asset sidecars.

This is the big middle of the hub. The AI helpers (``draft_card_from_inspiration``,
``rewrite_card_field``, ``transcribe_card``) reach ``_complete`` through the hub
package (``_pkg``) so a test patching ``H._complete`` is honored.
"""
from __future__ import annotations

import base64
import binascii
import json
import logging
import os
import re
import shutil
import time
import urllib.parse
from pathlib import Path
from typing import Any

from ...content.cards import CharacterCard, detect_language, looks_like_world_book, merge_world_into_card
from ...content.imaging import CAP_ART, avatar_thumb_data_uri, compress_image_bytes
from ...session import sessions as S
from ..dispatch import RpcError
from ._common import HubRpcError, _slug
from .config import bundled_cards_dir, user_cards_dir, user_worlds_dir

_log = logging.getLogger("lunamoth.server.hub")


def _pkg():
    from .. import hub
    return hub


# ---- AI-assisted card drafts --------------------------------------------------

_CARD_DRAFT_SYSTEM = """You draft editable SillyTavern/LunaMoth character-card material from a user's inspiration.
The human is the author: preserve their ideas, names, relationships, tone, taboos, and wording where possible.
Do not contradict the inspiration. If a detail is missing, choose conservative, editable placeholder-like detail.
Write the persona and all prose in the SAME LANGUAGE as the user's inspiration.

Reply with STRICT JSON ONLY: one object, no markdown, no comments, no trailing prose.
The object must have exactly these keys:
{
  "name": string,
  "user_name": string,
  "description": string,
  "personality": string,
  "scenario": string,
  "first_mes": string,
  "world_entries": [{"keys": [string, ...], "content": string, "constant": boolean}],
  "seed_goals": [string],
  "tagline": string,
  "theme_color": string
}

Requirements:
- user_name: who "you" — the human who will talk to this character — ARE inside this world: a short name or role and your relationship to the character. Use whatever the inspiration says about the reader / "you". If the inspiration does NOT say who you are, do NOT invent a second protagonist: assign a neutral, moderate role that simply fits the world — name it neutrally (e.g. "friend" / "朋友") and make "you" an ordinary person of this world. Never leave it empty.
- description: the character persona, 150-400 words when the language uses spaces; for CJK, a similarly rich 2-5 paragraphs. Convey the character's goals and motivations, not just appearance.
- personality: a concise distillation of the character's temperament and traits (a phrase or a few sentences).
- scenario: the current situation / setting the character is in right now (1-3 sentences).
- first_mes: an opening message in character — the FIRST thing the character says, in their own voice.
- world_entries: up to 4 lorebook entries (0 is fine). keys are short trigger words/names. At most one entry may be constant=true.
- seed_goals: up to 3 short ongoing pursuits (0 is fine).
- tagline: one line.
- theme_color: a hex color like "#5B9FD4".
The avatar is NOT generated here — the human uploads one or generates it on demand later."""

_THEME_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
_SVG_MAX_CHARS = 1500
_SVG_EVENT_ATTR_RE = re.compile(r"\son[a-zA-Z0-9_.:-]*\s*=")
_SVG_EXTERNAL_REF_RE = re.compile(r"""\b(?:href|xlink:href)\s*=\s*["']\s*(?!#)[^"']+["']|url\(\s*["']?\s*(?!#)[^)]+""",
                                  re.IGNORECASE)
_SVG_SCRIPT_RE = re.compile(r"<\s*/?\s*script(?:\s|>|/)", re.IGNORECASE)
_SVG_FOREIGN_RE = re.compile(r"<\s*/?\s*foreignobject(?:\s|>|/)", re.IGNORECASE)
_SVG_TEXT_RE = re.compile(r"<\s*/?\s*text(?:\s|>|/)", re.IGNORECASE)
_SVG_VIEWBOX_RE = re.compile(r"""\bviewbox\s*=\s*["']0\s+0\s+64\s+64["']""", re.IGNORECASE)


def _invalid_draft(message: str) -> HubRpcError:
    return HubRpcError(-32050, f"the model returned an invalid draft: {message}",
                       {"kind": "draft_schema", "detail": message})


def _sanitize_avatar_svg(value: Any) -> tuple[str, str]:
    """Return (safe_svg, note). Unsafe SVG is dropped, never repaired."""
    if value is None:
        return "", "avatar_svg dropped: missing"
    if not isinstance(value, str):
        return "", "avatar_svg dropped: not a string"
    svg = value.strip()
    low = svg.lower()
    if not svg:
        return "", "avatar_svg dropped: empty"
    if len(svg) > _SVG_MAX_CHARS:
        return "", "avatar_svg dropped: over 1500 characters"
    if not low.startswith("<svg"):
        return "", "avatar_svg dropped: it does not start with <svg"
    if not _SVG_VIEWBOX_RE.search(svg):
        return "", "avatar_svg dropped: missing viewBox 0 0 64 64"
    if _SVG_SCRIPT_RE.search(svg):
        return "", "avatar_svg dropped: script element"
    if _SVG_FOREIGN_RE.search(svg):
        return "", "avatar_svg dropped: foreignObject element"
    if _SVG_TEXT_RE.search(svg):
        return "", "avatar_svg dropped: text element"
    if _SVG_EVENT_ATTR_RE.search(svg):
        return "", "avatar_svg dropped: event handler attribute"
    if _SVG_EXTERNAL_REF_RE.search(svg):
        return "", "avatar_svg dropped: external reference"
    return svg, ""


def _theme_color(value: Any) -> str:
    if not isinstance(value, str) or not _THEME_RE.match(value.strip()):
        raise _invalid_draft("theme_color must be a #RRGGBB hex color")
    return value.strip().upper()


def _clean_theme_color(value: Any) -> str:
    if isinstance(value, str) and _THEME_RE.match(value.strip()):
        return value.strip().upper()
    return ""


def _clean_theme(value: Any, legacy: Any = None) -> dict[str, str]:
    """Normalize the dual theme `{primary, secondary}`; back-compat with the
    legacy single `theme_color`. Returns only the keys that have a valid color
    (an empty dict when nothing is set)."""
    primary = ""
    secondary = ""
    if isinstance(value, dict):
        primary = _clean_theme_color(value.get("primary"))
        secondary = _clean_theme_color(value.get("secondary"))
    if not primary:
        primary = _clean_theme_color(legacy)
    out: dict[str, str] = {}
    if primary:
        out["primary"] = primary
    if secondary:
        out["secondary"] = secondary
    return out


def _string_field(obj: dict[str, Any], key: str) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        raise _invalid_draft(f"{key} must be a non-empty string")
    return value.strip()


def _validate_world_entries(value: Any) -> list[dict[str, Any]]:
    """Lenient: keep the well-formed entries (cap 4, at most one constant) and skip
    the rest. An empty or odd-sized list is fine — a card may simply have little
    world. Generation must NOT fail because the model returned the wrong count."""
    out: list[dict[str, Any]] = []
    constants = 0
    if not isinstance(value, list):
        return out
    for entry in value:
        if len(out) >= 4 or not isinstance(entry, dict):
            continue
        keys = entry.get("keys")
        clean_keys = [str(k).strip() for k in keys if isinstance(k, str) and str(k).strip()] if isinstance(keys, list) else []
        content = entry.get("content")
        if not clean_keys or not isinstance(content, str) or not content.strip():
            continue
        constant = bool(entry.get("constant")) and constants == 0
        constants += 1 if constant else 0
        out.append({"keys": clean_keys[:6], "content": content.strip(), "constant": constant})
    return out


def _validate_seed_goals(value: Any) -> list[str]:
    """Lenient: keep up to 3 non-empty goals; an empty list is fine."""
    if not isinstance(value, list):
        return []
    return [str(g).strip() for g in value if isinstance(g, str) and str(g).strip()][:3]


# Who "you" are in the world, when the model leaves it blank: a neutral, moderate
# ordinary-person role in the card's language (never empty — the operator name is
# fixed at wake and must always resolve to something).
_DEFAULT_USER_BY_LANG = {"zh": "朋友", "en": "friend"}


def _validate_user_name(value: Any, lang: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return _DEFAULT_USER_BY_LANG.get(lang, "friend")


def _parse_card_draft(raw: str) -> dict[str, Any]:
    try:
        obj = json.loads(raw.strip())
    except json.JSONDecodeError as exc:
        raise HubRpcError(
            -32050,
            f"the model did not return strict JSON ({exc.msg} at line {exc.lineno}, column {exc.colno})",
            {"kind": "draft_json", "detail": str(exc)},
        ) from exc
    if not isinstance(obj, dict):
        raise _invalid_draft("top-level JSON must be an object")
    # Tolerant schema: the essentials must be present (else it's not a card draft),
    # extra keys are rejected (a wholly-wrong/parallel schema), but the rest may be
    # absent and are defaulted — generation should not fail on a small deviation.
    required = {"name", "description"}
    allowed = required | {"user_name", "personality", "scenario", "first_mes",
                          "world_entries", "seed_goals", "tagline", "theme_color"}
    got = set(obj)
    missing = required - got
    extra = got - allowed
    if missing or extra:
        parts = []
        if missing:
            parts.append(f"missing: {', '.join(sorted(missing))}")
        if extra:
            parts.append(f"unexpected: {', '.join(sorted(extra))}")
        raise _invalid_draft("draft keys must match the requested schema (" + "; ".join(parts) + ")")
    name = _string_field(obj, "name")
    description = _string_field(obj, "description")
    opt = lambda k: str(obj.get(k) or "").strip()  # noqa: E731 — soft string field
    # The card's language drives the neutral user_name fallback (朋友 / friend).
    lang = detect_language(text=f"{description} {name}")
    draft = {
        "name": name,
        "user_name": _validate_user_name(obj.get("user_name"), lang),
        "description": description,
        "personality": opt("personality"),
        "scenario": opt("scenario"),
        "first_mes": opt("first_mes"),
        "world_entries": _validate_world_entries(obj.get("world_entries")),
        "seed_goals": _validate_seed_goals(obj.get("seed_goals")),
        "tagline": opt("tagline"),
        "theme_color": _theme_color(obj.get("theme_color")),
        "embodiment": "literal",
    }
    # No avatar is drafted — it's a manual upload/generate step (stored as a sidecar).
    return draft


def draft_card_from_inspiration(defaults: dict[str, str], inspiration: str, model: str = "") -> dict[str, Any]:
    text = inspiration.strip()
    if not text:
        raise RpcError(-32602, "cards.draft needs inspiration")
    raw = _pkg()._complete(
        defaults,
        _CARD_DRAFT_SYSTEM,
        text,
        model=model,
        max_tokens=4096,
        temperature=0.75,
        response_format={"type": "json_object"},
    )
    if not raw.strip():
        raise HubRpcError(-32050, "the model returned an empty draft", {"kind": "draft_json", "detail": "empty response"})
    return _parse_card_draft(raw)


# ---- per-field AI edit (natural-language rewrite of ONE card field) -------------

_FIELD_REWRITE_SYSTEM = (
    "You are editing ONE field of a SillyTavern/LunaMoth character card. Rewrite just "
    "that field. Keep the SAME language as the current text. Preserve the character's "
    "established name, voice, world and facts unless the instruction says otherwise. "
    "Return ONLY the new field text — no quotes, no markdown, no labels, no commentary."
)

# Human-readable shape hint per field, so the model returns the right kind of text.
_FIELD_REWRITE_LABEL = {
    "name": "the character's name (a short name)",
    "description": "the character persona/description (rich prose)",
    "personality": "the character's personality (concise traits)",
    "scenario": "the scene/setting the character is in",
    "first_mes": "the character's opening message, in their own voice",
    "tagline": "a one-line tagline",
    "user_name": "who YOU (the human) are in this world — a short name or role",
    "user_persona": "a short description of who YOU (the human) are to the character",
    "goals": "the character's seed goals, one short goal per line",
    "world_entries": "world-book lorebook entries, one per line as 'key1, key2 — content'",
}


def rewrite_card_field(defaults: dict[str, str], field: str, value: str = "",
                       instruction: str = "", context: str = "", model: str = "") -> dict[str, Any]:
    """Rewrite ONE card field with the LLM. Empty instruction = free rephrase of the
    current value; a non-empty instruction steers the change. Returns {field, text}.
    No fallback: a failed/empty model call surfaces as a visible error."""
    field = (field or "").strip()
    if not field:
        raise RpcError(-32602, "card.rewrite_field needs a field")
    value = value if isinstance(value, str) else ""
    label = _FIELD_REWRITE_LABEL.get(field, f"the '{field}' field")
    directive = (instruction or "").strip() or (
        "Rephrase it freely — keep the meaning and language, but improve the wording and flavor."
    )
    parts = [f"Field: {label}"]
    if (context or "").strip():
        parts.append(f"\nCharacter context (do not rewrite this, just for consistency):\n{context.strip()}")
    parts.append(f"\nCurrent text:\n{value.strip() or '(empty)'}")
    parts.append(f"\nInstruction: {directive}")
    raw = _pkg()._complete(defaults, _FIELD_REWRITE_SYSTEM, "\n".join(parts),
                           model=model, max_tokens=2048, temperature=0.9)
    text = _strip_text_fence(raw).strip()
    if not text:
        raise HubRpcError(-32050, "the model returned an empty rewrite",
                          {"kind": "rewrite", "detail": "empty response"})
    return {"field": field, "text": text}


def _strip_text_fence(raw: str) -> str:
    """Drop a ```...``` fence the model may wrap text in, despite instructions."""
    s = (raw or "").strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else ""
        if s.rstrip().endswith("```"):
            s = s.rstrip()[:-3]
    return s.strip()


# ---- avatar sidecar storage --------------------------------------------------
# The avatar is a SEPARATE file beside the card (the card stays the soul; the
# avatar is presentation). Supported uploads: png/jpg/jpeg/svg.
_AVATAR_EXTS = ("png", "jpg", "jpeg", "svg")
_AVATAR_MIME = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "svg": "image/svg+xml"}
_AVATAR_MAX_BYTES = 1024 * 1024  # ~1MB cap
# Magic-byte sniff so an uploaded ".png" really is one (defence in depth).
_AVATAR_MAGIC = {"png": b"\x89PNG\r\n\x1a\n", "jpg": b"\xff\xd8\xff", "jpeg": b"\xff\xd8\xff"}


def _avatar_sidecar_path(card_path: Path, ext: str) -> Path:
    return card_path.with_name(f"{card_path.stem}.avatar.{ext}")


def _writable_card_path(path: str) -> Path:
    """A JSON card path we may edit: a user-deck card OR a chara's own frozen
    session card (so the in-chat Visuals editor can change the LIVING chara's
    art). Both are traversal-confined to their root; anything else is refused."""
    p = Path(str(path or ""))
    if not p.is_file():
        raise RpcError(-32035, f"no such card: {path}")
    if p.suffix.lower() != ".json":
        raise RpcError(-32031, "avatar editing needs a JSON card (PNG cards are read-only here)")
    rp = p.resolve()
    if user_cards_dir().resolve() in rp.parents:
        return p
    # A frozen session card lives at <sessions>/<name>/card.json (exactly one
    # level deep). Sidecars the asset RPCs write land beside it, inside the
    # session dir — confined. This is what lets the chat Visuals tab edit the
    # active chara's own card.
    sessions = S.sessions_dir().resolve()
    if rp.name == "card.json" and rp.parent.parent == sessions:
        return p
    raise RpcError(-32031, "only a deck card or a chara's own session card can be edited")


def _avatar_data_uri(card_path: Path, card: "CharacterCard") -> str:
    """Resolve a card's avatar to a FULL-res data-URI: sidecar first, inline SVG
    fallback, else ''. This is the `card.avatar_read` path — the heavy one a
    caller asks for explicitly. The board list uses `_avatar_thumb_uri`."""
    sidecar = card.avatar_path()
    if sidecar is not None:
        ext = sidecar.suffix.lower().lstrip(".")
        mime = _AVATAR_MIME.get(ext, "application/octet-stream")
        data = base64.b64encode(sidecar.read_bytes()).decode("ascii")
        return f"data:{mime};base64,{data}"
    ext = card.extensions.get("lunamoth") if isinstance(card.extensions, dict) else None
    if isinstance(ext, dict):
        svg, _note = _sanitize_avatar_svg(ext.get("avatar_svg"))
        if svg:
            return "data:image/svg+xml;charset=utf-8," + urllib.parse.quote(svg)
    return ""


def _avatar_thumb_uri(card_path: Path, card: "CharacterCard") -> str:
    """The SMALL inline avatar for list_cards (sent in every hub.state): a
    downscaled WEBP thumbnail (~5–15KB) of the raster sidecar, the inline SVG
    fallback otherwise. The full-res sidecar still rides /asset & avatar_read."""
    sidecar = card.avatar_path()
    if sidecar is not None and sidecar.suffix.lower().lstrip(".") != "svg":
        thumb = avatar_thumb_data_uri(sidecar)
        if thumb:
            return thumb
        # Undecodable raster: fall back to the full-res embed rather than nothing.
        return _avatar_data_uri(card_path, card)
    return _avatar_data_uri(card_path, card)


def _asset_url(p: Path | None) -> str | None:
    """A same-origin URL the static server resolves to an art-asset sidecar.

    The avatar stays an inline data-URI (tiny); the heavier art (sprite /
    background / keyvisual / stickers) rides cacheable URLs so list_cards (sent
    in every hub.state) doesn't carry megabytes of base64. Served by the
    /asset route in supervisor.WebHandler, which confines reads to the card &
    session dirs."""
    if p is None:
        return None
    return "/asset?p=" + urllib.parse.quote(str(p))


def avatar_read(path: str) -> dict[str, Any]:
    """The card's avatar as a data-URI an <img> can use (sidecar preferred)."""
    p = Path(str(path or ""))
    if not p.is_file():
        raise RpcError(-32035, f"no such card: {path}")
    try:
        card = CharacterCard.load(p)
    except Exception as exc:  # noqa: BLE001
        raise RpcError(-32035, f"unreadable card: {exc}") from exc
    return {"data_uri": _avatar_data_uri(p, card) or None}


def avatar_upload(path: str, data_b64: str, ext: str) -> dict[str, Any]:
    """Validate an uploaded avatar, write it as a sidecar, point the card at it.

    Accepts png/jpg/jpeg/svg, caps at ~1MB. SVG must pass the same safety
    checks as a generated one (script/foreignObject/text/event-handler/
    external-ref free, viewBox 0 0 64 64). The inline `avatar_svg` fallback is
    dropped once a sidecar exists — the sidecar is now the source of truth."""
    target = _writable_card_path(path)
    ext = str(ext or "").strip().lower().lstrip(".")
    if ext == "jpeg":
        ext = "jpeg"  # keep the extension the caller chose; mime is the same
    if ext not in _AVATAR_EXTS:
        raise RpcError(-32602, f"unsupported avatar type: .{ext} (allowed: {', '.join(_AVATAR_EXTS)})")
    try:
        raw = base64.b64decode(str(data_b64 or ""), validate=True)
    except (ValueError, binascii.Error) as exc:
        raise RpcError(-32602, f"avatar data is not valid base64: {exc}") from exc
    if not raw:
        raise RpcError(-32602, "avatar data is empty")
    if len(raw) > _AVATAR_MAX_BYTES:
        raise HubRpcError(-32602, "avatar is too large (max 1MB)",
                          {"kind": "avatar_size", "detail": f"{len(raw)} bytes"})
    if ext == "svg":
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise RpcError(-32602, f"SVG is not valid UTF-8: {exc}") from exc
        svg, note = _sanitize_avatar_svg(text)
        if not svg:
            raise HubRpcError(-32050, "the SVG did not pass the safety checks",
                              {"kind": "avatar_svg", "detail": note})
        payload = svg.encode("utf-8")
    else:
        magic = _AVATAR_MAGIC.get(ext)
        if magic and not raw.startswith(magic):
            raise HubRpcError(-32602, f"the file does not look like a .{ext} image",
                              {"kind": "avatar_type", "detail": "magic-byte mismatch"})
        payload = raw
    # One sidecar per card: remove any stale sidecar of a different extension.
    for old in _AVATAR_EXTS:
        sc = _avatar_sidecar_path(target, old)
        if sc.name != _avatar_sidecar_path(target, ext).name and sc.exists():
            try:
                sc.unlink()
            except OSError:
                pass
    sidecar = _avatar_sidecar_path(target, ext)
    sidecar.write_bytes(payload)
    # Point the card at the sidecar; drop the inline fallback (sidecar wins now).
    raw_card = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(raw_card, dict):
        raise RpcError(-32602, "card is not a JSON object")
    data = raw_card.get("data")
    if not isinstance(data, dict):
        data = raw_card["data"] = {}
    ext_root = data.get("extensions")
    if not isinstance(ext_root, dict):
        ext_root = data["extensions"] = {}
    lm = ext_root.get("lunamoth")
    if not isinstance(lm, dict):
        lm = ext_root["lunamoth"] = {}
    lm["avatar_file"] = sidecar.name
    lm.pop("avatar_svg", None)
    target.write_text(json.dumps(raw_card, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"path": str(target), "avatar_file": sidecar.name,
            "data_uri": f"data:{_AVATAR_MIME[ext]};base64,{base64.b64encode(payload).decode('ascii')}"}


# ---- art-asset sidecars (sprite / background / keyvisual) --------------------
# The heavy art (R9 visual set + user uploads). Unlike the tiny avatar (inlined as
# a data-URI in every hub.state), these ride cacheable /asset URLs, so the cap is
# generous and they're never base64-inlined into list_cards.
_ART_ASSET_KINDS = ("sprite", "background", "keyvisual")
_ART_EXTS = ("png", "jpg", "jpeg", "webp")
_ART_MIME = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}
_ART_MAGIC = {"png": b"\x89PNG\r\n\x1a\n", "jpg": b"\xff\xd8\xff", "jpeg": b"\xff\xd8\xff"}
_ART_MAX_BYTES = 16 * 1024 * 1024  # generated art is a few MB; cap well above that


def _art_sidecar_path(card_path: Path, kind: str, ext: str) -> Path:
    return card_path.with_name(f"{card_path.stem}.{kind}.{ext}")


def _looks_like(raw: bytes, ext: str) -> bool:
    if ext == "webp":
        return len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"
    magic = _ART_MAGIC.get(ext)
    return not magic or raw.startswith(magic)


def asset_save(path: str, kind: str, data_b64: str, ext: str) -> dict[str, Any]:
    """Write a sprite/background/keyvisual sidecar (upload OR a saved generation)
    and point the card's ``extensions.lunamoth.assets[kind]`` at it. png/jpg/webp,
    capped at 16MB. One sidecar per kind (stale extensions are removed)."""
    target = _writable_card_path(path)
    kind = str(kind or "").strip().lower()
    if kind not in _ART_ASSET_KINDS:
        raise RpcError(-32602, f"unknown art asset kind: {kind} (one of {', '.join(_ART_ASSET_KINDS)})")
    ext = str(ext or "").strip().lower().lstrip(".")
    if ext not in _ART_EXTS:
        raise RpcError(-32602, f"unsupported art type: .{ext} (allowed: {', '.join(_ART_EXTS)})")
    try:
        raw = base64.b64decode(str(data_b64 or ""), validate=True)
    except (ValueError, binascii.Error) as exc:
        raise RpcError(-32602, f"asset data is not valid base64: {exc}") from exc
    if not raw:
        raise RpcError(-32602, "asset data is empty")
    if len(raw) > _ART_MAX_BYTES:
        raise HubRpcError(-32602, "asset is too large (max 16MB)",
                          {"kind": "asset_size", "detail": f"{len(raw)} bytes"})
    if not _looks_like(raw, ext):
        raise HubRpcError(-32602, f"the file does not look like a .{ext} image",
                          {"kind": "asset_type", "detail": "magic-byte mismatch"})
    # Compress on save (cap long side, preserve format+alpha) so user uploads
    # don't reintroduce huge files. Best-effort: a non-shrinkable image is kept
    # as-is, so the already-validated bytes are never lost.
    raw = compress_image_bytes(raw, ext, CAP_ART)
    keep = _art_sidecar_path(target, kind, ext).name
    for old in _ART_EXTS:
        sc = _art_sidecar_path(target, kind, old)
        if sc.name != keep and sc.exists():
            try:
                sc.unlink()
            except OSError:
                pass
    sidecar = _art_sidecar_path(target, kind, ext)
    sidecar.write_bytes(raw)
    raw_card = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(raw_card, dict):
        raise RpcError(-32602, "card is not a JSON object")
    data = raw_card.get("data")
    if not isinstance(data, dict):
        data = raw_card["data"] = {}
    ext_root = data.get("extensions")
    if not isinstance(ext_root, dict):
        ext_root = data["extensions"] = {}
    lm = ext_root.get("lunamoth")
    if not isinstance(lm, dict):
        lm = ext_root["lunamoth"] = {}
    assets = lm.get("assets")
    if not isinstance(assets, dict):
        assets = lm["assets"] = {}
    assets[kind] = sidecar.name
    target.write_text(json.dumps(raw_card, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"path": str(target), "kind": kind, "file": sidecar.name, "url": _asset_url(sidecar)}


def asset_delete(path: str, kind: str) -> dict[str, Any]:
    """Remove an art asset (avatar / sprite / background / keyvisual): delete its
    sidecar file(s) and drop the card's pointer. Idempotent."""
    target = _writable_card_path(path)
    kind = str(kind or "").strip().lower()
    raw_card = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(raw_card, dict):
        raise RpcError(-32602, "card is not a JSON object")
    data = raw_card.get("data") if isinstance(raw_card.get("data"), dict) else {}
    ext_root = data.get("extensions") if isinstance(data.get("extensions"), dict) else {}
    lm = ext_root.get("lunamoth") if isinstance(ext_root.get("lunamoth"), dict) else {}
    removed = False
    if kind == "avatar":
        for e in _AVATAR_EXTS:
            sc = _avatar_sidecar_path(target, e)
            if sc.exists():
                try:
                    sc.unlink(); removed = True
                except OSError:
                    pass
        if isinstance(lm, dict):
            lm.pop("avatar_file", None)
            lm.pop("avatar_svg", None)
    elif kind in _ART_ASSET_KINDS:
        for e in _ART_EXTS:
            sc = _art_sidecar_path(target, kind, e)
            if sc.exists():
                try:
                    sc.unlink(); removed = True
                except OSError:
                    pass
        assets = lm.get("assets") if isinstance(lm, dict) else None
        if isinstance(assets, dict):
            assets.pop(kind, None)
    else:
        raise RpcError(-32602, f"unknown asset kind: {kind}")
    target.write_text(json.dumps(raw_card, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"path": str(target), "kind": kind, "removed": removed}


def _card_sources() -> dict[str, list[str]]:
    """original card path -> session names that froze a copy of it."""
    refs: dict[str, list[str]] = {}
    for meta in S.list_sessions():
        src = meta.root / "card_source"
        try:
            original = src.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if original:
            refs.setdefault(original, []).append(meta.name)
    return refs


def _copy_card_assets(card: "CharacterCard", dest_dir: Path, src_base: Path | None = None) -> None:
    """Copy the art-asset sidecars a card DECLARES (avatar + sprite/background/
    keyvisual/stickers, preserving their relative names) into dest_dir, reading
    from src_base (defaults to the card's own folder). `card` supplies the
    declared list; `src_base` supplies where the files actually live — so a
    wake that froze an EDITED card still copies from the source template folder.
    Best-effort; a missing/unreadable asset is skipped, never fatal to wake."""
    base = Path(src_base) if src_base else (Path(card.source_path).parent if card.source_path else None)
    if base is None:
        return
    rels: list[str] = []
    if card.avatar_file():
        rels.append(card.avatar_file())
    a = card.assets()
    for kind in ("sprite", "background", "keyvisual"):
        v = a.get(kind)
        if isinstance(v, str):
            rels.append(v)
    stk = a.get("stickers")
    if isinstance(stk, list):
        rels += [s for s in stk if isinstance(s, str)]
    for rel in rels:
        rel = rel.strip().replace("\\", "/")
        if not rel or rel.startswith("/") or ".." in rel.split("/"):
            continue
        srcf = base / rel
        if not srcf.is_file():
            continue
        dstf = dest_dir / rel
        try:
            dstf.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(srcf, dstf)
        except OSError:
            pass


def _iter_card_files(base: Path):
    """Card files under a deck dir: per-character folders (`<Name>/card*.json|png`)
    plus legacy flat files (`*.json|png`) for back-compat. Skips hidden/LICENSE."""
    for p in sorted(base.iterdir()):
        if p.name.startswith("."):
            continue
        if p.is_dir():
            for c in sorted(p.glob("card*.json")) + sorted(p.glob("card*.png")):
                yield c
        elif p.suffix.lower() in (".json", ".png") and not p.stem.startswith("LICENSE"):
            yield p


def _card_entry(path: Path, builtin: bool, refs: dict[str, list[str]]) -> dict[str, Any] | None:
    try:
        card = CharacterCard.load(path)
    except Exception:  # noqa: BLE001 - one bad card must not break the deck
        _log.warning("unreadable card: %s", path, exc_info=True)
        return None
    ext = card.extensions.get("lunamoth", {}) if isinstance(card.extensions, dict) else {}
    # The world is the card's embedded book; surface its name for the deck label.
    world = str(card.character_book.name or "") if card.character_book else ""
    theme_color = ""
    avatar_svg = ""
    tagline = ""
    embodiment = ""
    theme = card.theme_colors()
    avatar_uri = _avatar_thumb_uri(path, card)
    if isinstance(ext, dict):
        theme_color = theme.get("primary", "")
        avatar_svg = _sanitize_avatar_svg(ext.get("avatar_svg"))[0]
        tagline = str(ext.get("tagline") or "")
        embodiment = str(ext.get("embodiment") or "")
    used_by = refs.get(str(path), [])
    full_tags = [str(t) for t in (card.tags or [])]
    # The default-card marker must survive display truncation: the deck/welcome
    # key on `default`, and a card can carry it past the 4-tag display cap.
    is_default = any(t.strip().lower() == "default" for t in full_tags)
    return {
        "path": str(path),
        "name": card.name or path.stem,
        "lang": card.language,
        "tags": full_tags[:4],
        "default": is_default,
        "world": world,
        "builtin": builtin,
        "draft": bool(isinstance(ext, dict) and ext.get("draft")),
        "frozen": bool(used_by),
        "used_by": used_by,
        "locked": False,   # a deck template — editable/wakeable (overridden for chara cards)
        "owner": "",       # the chara that owns this card, for locked session cards
        "creator_notes": (card.creator_notes or "")[:300],
        "tagline": tagline[:160],
        "theme_color": theme_color,
        "theme": {"primary": theme.get("primary", ""), "secondary": theme.get("secondary", "")},
        "avatar_svg": avatar_svg,
        "avatar_uri": avatar_uri,
        "sprite_url": _asset_url(card.asset_path("sprite")),
        "bg_url": _asset_url(card.asset_path("background")),
        "keyvisual_url": _asset_url(card.asset_path("keyvisual")),
        "stickers_urls": [u for u in (_asset_url(p) for p in card.sticker_paths()) if u],
        "embodiment": embodiment if embodiment in ("literal", "actor") else "",
    }


def list_cards() -> list[dict[str, Any]]:
    """Every deck card. Shadowing semantics (webui-needs #11): a USER card
    hides only a BUILTIN of the same name+lang (local-first, like skills),
    and the surviving entry says so via `shadows: <hidden path>`. User cards
    never hide each other — same-name user files all appear (path is the
    identity); silent disappearance is what read as 'the locked card moved
    and unlocked'."""
    refs = _card_sources()
    out: list[dict[str, Any]] = []
    user_by_key: dict[str, dict[str, Any]] = {}
    for base, builtin in ((user_cards_dir(), False), (bundled_cards_dir(), True)):
        if not base.is_dir():
            continue
        for p in _iter_card_files(base):
            entry = _card_entry(p, builtin, refs)
            if not entry:
                continue
            key = entry["name"] + entry["lang"]
            if builtin and key in user_by_key:
                user_by_key[key]["shadows"] = entry["path"]
                continue
            if not builtin:
                user_by_key.setdefault(key, entry)
            out.append(entry)
    # Each living chara owns its own frozen card — a LOCKED deck entry (browse /
    # copy / wake only), so every card in the system is browsable in the deck.
    for meta in S.list_sessions():
        entry = _session_card_entry(meta)
        if entry is not None:
            out.append(entry)
    return out


def _session_card_entry(meta: S.SessionMeta) -> dict[str, Any] | None:
    """A chara's frozen card as a LOCKED deck entry (owned by the chara)."""
    frozen = meta.root / "card.json"
    if not frozen.exists():
        frozen = meta.root / "card.png"
    if not frozen.exists():
        return None
    entry = _card_entry(frozen, False, {})
    if entry is None:
        return None
    entry["locked"] = True
    entry["owner"] = meta.name
    entry["frozen"] = True
    entry["used_by"] = [meta.name]
    return entry


def save_card(data: dict[str, Any], path: str = "") -> dict[str, Any]:
    """Write a V3 card JSON into the user deck (create flow / drafts)."""
    if not isinstance(data, dict) or not isinstance(data.get("data"), dict):
        raise RpcError(-32602, "card.save expects a {spec, data:{...}} card object")
    name = str(data["data"].get("name") or "").strip()
    if not name:
        raise RpcError(-32602, "the card needs a name")
    target: Path
    if path:
        target = Path(path)
        if user_cards_dir() not in target.parents:
            raise RpcError(-32031, "only cards in the user deck can be written")
    else:
        base = user_cards_dir()
        base.mkdir(parents=True, exist_ok=True)
        stem = _slug(name)
        target = base / f"{stem}.json"
        n = 2
        while target.exists():
            target = base / f"{stem}-{n}.json"
            n += 1
    data.setdefault("version", "1.0")  # our own card format; we no longer emit the ST spec markers
    data["name"] = name
    _sanitize_card_extensions(data)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"path": str(target)}


def _merge_preserving(base: Any, over: Any) -> Any:
    """Deep-merge ``over`` onto ``base``, but an EMPTY value in ``over`` never
    wipes a non-empty value in ``base``.

    Root-fix for the wake data-loss bug: the wake editor round-trips the WHOLE
    card through UI fields and submits it back, but (a) it renders no field for
    mes_example / system_prompt / post_history_instructions, and (b) a load/value
    hiccup (e.g. card.read caught to null) can blank every field. Either way an
    empty submitted field would overwrite the source's real content and freeze a
    persona-less, greeting-less chara. Merging the edit ONTO the freshly-loaded
    SOURCE card with this rule means a blank edit keeps the source value, so the
    frozen chara always carries the full persona, first_mes, and avatar
    declaration — while a genuinely-edited (non-empty) field still wins."""
    if isinstance(base, dict) and isinstance(over, dict):
        out = dict(base)
        for k, v in over.items():
            out[k] = _merge_preserving(out[k], v) if k in out else v
        return out
    if over in ("", None, [], {}) and base not in ("", None, [], {}):
        return base
    return over


def _sanitize_card_extensions(card: dict[str, Any]) -> None:
    data = card.get("data") if isinstance(card.get("data"), dict) else {}
    ext_root = data.get("extensions")
    if not isinstance(ext_root, dict):
        return
    lunamoth = ext_root.get("lunamoth")
    if not isinstance(lunamoth, dict):
        return
    svg, _note = _sanitize_avatar_svg(lunamoth.get("avatar_svg"))
    if svg:
        lunamoth["avatar_svg"] = svg
    else:
        lunamoth.pop("avatar_svg", None)
    # avatar_file (sidecar reference): keep only a bare, traversal-free filename.
    af = lunamoth.get("avatar_file")
    if isinstance(af, str) and af.strip() and "/" not in af and "\\" not in af and ".." not in af:
        lunamoth["avatar_file"] = af.strip()
    else:
        lunamoth.pop("avatar_file", None)
    # Dual theme {primary, secondary}; fold a legacy theme_color into primary.
    theme = _clean_theme(lunamoth.get("theme"), lunamoth.get("theme_color"))
    if theme:
        lunamoth["theme"] = theme
    else:
        lunamoth.pop("theme", None)
    lunamoth.pop("theme_color", None)
    if lunamoth.get("embodiment") not in ("literal", "actor"):
        lunamoth["embodiment"] = "literal"


def _safe_extensions_for_ui(extensions: dict[str, Any]) -> dict[str, Any]:
    """Copy card extensions with lunamoth visual fields sanitized for rendering."""
    if not isinstance(extensions, dict):
        return {}
    out = dict(extensions)
    lunamoth = out.get("lunamoth")
    if not isinstance(lunamoth, dict):
        return out
    safe = dict(lunamoth)
    svg, _note = _sanitize_avatar_svg(safe.get("avatar_svg"))
    if svg:
        safe["avatar_svg"] = svg
    else:
        safe.pop("avatar_svg", None)
    theme = _clean_theme(safe.get("theme"), safe.get("theme_color"))
    if theme:
        safe["theme"] = theme
        # Mirror primary into the legacy field so older renderers still color.
        safe["theme_color"] = theme["primary"]
    else:
        safe.pop("theme", None)
        safe.pop("theme_color", None)
    if safe.get("embodiment") not in ("literal", "actor"):
        safe["embodiment"] = ""
    out["lunamoth"] = safe
    return out


def duplicate_card(path: str) -> dict[str, Any]:
    """Copy a card into the user deck as a clearly distinct sibling.

    The copy gets a language-appropriate name suffix (otherwise it is
    indistinguishable from a frozen original on the deck — the '锁着的卡片
    复制之后就解锁了' confusion), loses the "default" tag (a copy must never
    steal the bundled-default slot), and PNG cards are lifted to JSON via
    their embedded card data."""
    p = Path(str(path or ""))
    if not p.is_file():
        raise RpcError(-32035, f"no such card: {path}")
    if p.suffix.lower() == ".png":
        from ...content.cards import _card_json_from_png

        try:
            card = _card_json_from_png(p)
        except Exception as exc:  # noqa: BLE001
            raise RpcError(-32035, f"could not read the PNG card: {exc}") from exc
    else:
        try:
            card = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RpcError(-32035, f"unreadable card: {exc}") from exc
    if not isinstance(card, dict) or not isinstance(card.get("data"), dict):
        raise RpcError(-32602, "card.duplicate expects a V2/V3 card")
    data = card["data"]
    name = str(data.get("name") or p.stem).strip() or p.stem
    lang = detect_language(str(p), str(data.get("description") or "") + str(data.get("name") or ""))
    suffix = "（副本）" if lang == "zh" else " (copy)"
    if not name.endswith(suffix):
        data["name"] = f"{name}{suffix}"
    tags = data.get("tags")
    if isinstance(tags, list):
        data["tags"] = [t for t in tags if str(t).strip().lower() != "default"]
    return save_card(card)  # user-deck write + sanitization + unique filename


def merge_world(card_path: str, world: Any) -> dict[str, Any]:
    """Fold a standalone ST world book into a card's embedded character_book.

    This is the import path now that the card is the ONE file: entries are
    appended (identical keys+content are skipped) and the card is saved via
    the normal card-save path, sanitization included. `world` may be a parsed
    world-book object or a path to a world-book .json.
    """
    p = Path(str(card_path or ""))
    if p.suffix.lower() != ".json":
        raise RpcError(-32602, "card.merge_world works on .json cards")
    if isinstance(world, str):
        wp = Path(world)
        if user_worlds_dir() not in wp.parents:
            raise RpcError(-32031, "world paths must live in the uploaded worlds directory")
        try:
            world = json.loads(wp.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RpcError(-32035, f"unreadable world book: {exc}") from exc
    if not isinstance(world, dict) or not world.get("entries"):
        raise RpcError(-32602, "card.merge_world expects a world book with entries")
    try:
        card = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RpcError(-32035, f"unreadable card: {exc}") from exc
    if not isinstance(card, dict) or not isinstance(card.get("data"), dict):
        raise RpcError(-32602, "card.merge_world expects a V2/V3 card (with a data block)")
    added = merge_world_into_card(card, world)
    saved = save_card(card, path=str(p))  # user-deck-only write + sanitization
    book = card["data"].get("character_book") or {}
    return {"path": saved["path"], "added": added, "entries": len(book.get("entries") or [])}


def store_upload(name: str, body: bytes) -> dict[str, Any]:
    """Store an uploaded file: cards go to the user deck; a .json that parses
    as a standalone world book (entries, no card data) is stored aside and
    reported as kind="world" so the deck can offer 'merge into card X'."""
    suffix = Path(name).suffix.lower()
    kind, base = "card", user_cards_dir()
    if suffix == ".json":
        try:
            obj = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            obj = None
        if looks_like_world_book(obj):
            kind, base = "world", user_worlds_dir()
    base.mkdir(parents=True, exist_ok=True)
    target = base / Path(name).name
    n = 2
    while target.exists():
        target = base / f"{Path(name).stem}-{n}{suffix}"
        n += 1
    target.write_bytes(body)
    return {"path": str(target), "kind": kind}


def _trash_cards_dir() -> Path:
    d = S.lunamoth_home() / ".trash" / "cards"
    d.mkdir(parents=True, exist_ok=True)
    return d


def delete_card(path: str) -> dict[str, Any]:
    """SOFT delete: move the card file into ~/.lunamoth/.trash/cards/<id>/ (with an
    origin manifest) instead of unlinking, so it's recoverable via card.restore.
    Returns the trash_id the UI uses for an Undo affordance."""
    p = Path(path)
    if user_cards_dir() not in p.parents:
        raise RpcError(-32031, "built-in cards cannot be deleted")
    if _card_sources().get(str(p)):
        raise RpcError(-32032, "this card is referenced by a living chara")
    if not p.exists():
        return {"ok": True, "trash_id": None}
    tid = os.urandom(6).hex()
    dest_dir = _trash_cards_dir() / tid
    dest_dir.mkdir(parents=True, exist_ok=True)
    p.replace(dest_dir / p.name)
    (dest_dir / "origin.json").write_text(
        json.dumps({"path": str(p), "name": p.name, "ts": int(time.time())}),
        encoding="utf-8",
    )
    return {"ok": True, "trash_id": tid}


def restore_card(trash_id: str) -> dict[str, Any]:
    """Undo a soft delete: move the trashed card file back to its original path."""
    tid = (trash_id or "").strip()
    # guard against path traversal — trash_id is an opaque hex token
    if not tid or not re.fullmatch(r"[0-9a-f]{1,32}", tid):
        raise RpcError(-32033, "unknown trash id")
    dest_dir = _trash_cards_dir() / tid
    manifest = dest_dir / "origin.json"
    if not manifest.exists():
        raise RpcError(-32033, "nothing to restore")
    info = json.loads(manifest.read_text(encoding="utf-8"))
    orig = Path(str(info.get("path") or ""))
    src = dest_dir / str(info.get("name") or "")
    if not src.exists() or user_cards_dir() not in orig.parents:
        raise RpcError(-32033, "trashed card cannot be restored")
    orig.parent.mkdir(parents=True, exist_ok=True)
    src.replace(orig)
    manifest.unlink(missing_ok=True)
    try:
        dest_dir.rmdir()
    except OSError:
        pass
    return {"ok": True, "path": str(orig)}


def _book_to_dict(book: Any) -> dict[str, Any] | None:
    if book is None or not hasattr(book, "entries"):
        return None
    entries = []
    for i, e in enumerate(getattr(book, "entries", []) or []):
        entries.append({
            "id": getattr(e, "entry_id", i),
            "keys": list(getattr(e, "keys", []) or []),
            "secondary_keys": list(getattr(e, "secondary_keys", []) or []),
            "content": str(getattr(e, "content", "")),
            "constant": bool(getattr(e, "constant", False)),
            "selective": bool(getattr(e, "selective", False)),
            "enabled": bool(getattr(e, "enabled", True)),
            "insertion_order": int(getattr(e, "order", i) or i),
            "comment": str(getattr(e, "comment", "")),
        })
    return {"name": str(getattr(book, "name", "") or ""), "entries": entries}


# ---- natural language -> card draft ----------------------------------------------

_TRANSCRIBE_SYSTEM = """You turn a person's free-form description of an original character (OC) \
into a structured character card. Write in the SAME LANGUAGE as the user's text. Preserve their \
ideas and wording where possible — you are a careful editor, not a co-author. Fill gaps \
conservatively and tastefully; never invent contradictions. Reply with ONLY a JSON object, \
no markdown fence, with exactly these keys:
{"name": str, "appearance": str, "personality": str, "scenario": str, "first_mes": str,
 "alternate_greetings": [str], "world": [{"key": str, "desc": str, "constant": bool}],
 "relationship": str, "goals": [str], "rules": str, "toolpack_hint": str}
- appearance: who they are + how they look, 2-4 sentences, prose.
- personality: temperament and voice, 2-4 sentences, prose.
- first_mes: their in-character opening line when meeting the user.
- world: 2-5 lorebook entries (key = a name/term, desc = one sentence); constant=true for at most one core entry.
- relationship: the user's place in this character's life, 1-2 sentences.
- goals: 1-3 ongoing pursuits, short phrases.
- rules: boundaries/never-dos if implied, else "".
- toolpack_hint: "sandbox" if this character would plausibly make things (art/code/writing), else ""."""


def transcribe_card(defaults: dict[str, str], text: str, model: str = "") -> dict[str, Any]:
    raw = _pkg()._complete(defaults, _TRANSCRIBE_SYSTEM, text.strip(), model=model)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?|\n?```$", "", raw).strip()
    try:
        draft = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RpcError(-32050, f"the model did not return a usable draft ({exc})") from exc
    if not isinstance(draft, dict) or not draft.get("name"):
        raise RpcError(-32050, "the model did not return a usable draft")
    return draft


def _draft_world_entries(draft: dict[str, Any]) -> list[dict[str, Any]]:
    source = draft.get("world_entries") if isinstance(draft.get("world_entries"), list) else draft.get("world")
    out: list[dict[str, Any]] = []
    for i, w in enumerate(source or []):
        if not isinstance(w, dict):
            continue
        raw_keys = w.get("keys")
        if isinstance(raw_keys, list):
            keys = [str(k).strip() for k in raw_keys if str(k).strip()]
        else:
            key = str(w.get("key") or "").strip()
            keys = [key] if key else []
        content = str(w.get("content") if "content" in w else w.get("desc", "")).strip()
        if not keys or not content:
            continue
        out.append({
            "id": i,
            "keys": keys[:6],
            "content": content,
            "constant": bool(w.get("constant")),
            "enabled": True,
            "insertion_order": i,
        })
    return out


def _draft_goals(draft: dict[str, Any]) -> list[str]:
    goals = draft.get("seed_goals") if isinstance(draft.get("seed_goals"), list) else draft.get("goals")
    if not isinstance(goals, list):
        return []
    return [str(g).strip() for g in goals if str(g).strip()][:5]


def draft_to_card(draft: dict[str, Any], origin_text: str = "", as_draft: bool = False) -> dict[str, Any]:
    """Assemble a V3 card object from a (possibly user-edited) draft."""
    world_entries = _draft_world_entries(draft)
    ext: dict[str, Any] = {"origin": origin_text[:8000], "embodiment": "literal"}
    if as_draft:
        ext["draft"] = True
    wishes = _draft_goals(draft)
    if wishes:
        ext["wishes"] = wishes
    if draft.get("rules"):
        ext["rules"] = str(draft["rules"])
    if draft.get("toolpack_hint"):
        ext["toolpack"] = str(draft["toolpack_hint"])
    if draft.get("tagline"):
        ext["tagline"] = str(draft["tagline"]).strip()
    # Who "you" are in this world (the SillyTavern persona convention) rides the card.
    if str(draft.get("user_name") or "").strip():
        ext["user_name"] = str(draft["user_name"]).strip()
    if str(draft.get("user_persona") or "").strip():
        ext["user_persona"] = str(draft["user_persona"]).strip()
    theme = _clean_theme(draft.get("theme"), draft.get("theme_color"))
    if theme:
        ext["theme"] = theme
    # No avatar from the draft — it's a manual upload/generate step (sidecar).
    embodiment = str(draft.get("embodiment") or "literal")
    ext["embodiment"] = embodiment if embodiment in ("literal", "actor") else "literal"

    description = str(draft.get("description") if draft.get("description") is not None else draft.get("appearance", ""))
    data: dict[str, Any] = {
        "name": str(draft.get("name", "")),
        "description": description,
        "personality": str(draft.get("personality", "")),
        "scenario": str(draft.get("scenario", "")) + (
            ("\n\n" + str(draft["relationship"])) if draft.get("relationship") else ""),
        "first_mes": str(draft.get("first_mes", "")),
        "mes_example": "",
        "system_prompt": "",
        "post_history_instructions": "",
        "alternate_greetings": [str(g) for g in (draft.get("alternate_greetings") or [])][:4],
        "creator_notes": str(draft.get("tagline", "")),
        "tags": ["original"],
        "extensions": {"lunamoth": ext},
    }
    if world_entries:
        data["character_book"] = {"name": f"{data['name']} world", "entries": world_entries}
    if detect_language(text=description + " " + data["first_mes"]) == "zh" and "中文" not in data["tags"]:
        data["tags"].append("中文")
    return {"version": "1.0", "name": data["name"], "data": data}
