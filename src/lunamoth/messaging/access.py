"""Shared messaging access-control: the allow-list + the refusal throttle.

Both the standalone :class:`~lunamoth.messaging.gateway.MessagingGateway` (own
agent + idle loop) and the in-child :class:`~lunamoth.server.messaging_host.
MessagingHost` (shared agent) gate inbound messages on the same two rules.
Keeping them here means a change lands in BOTH paths instead of drifting — the
"empty allow-list = open" fix previously had to be applied to each by hand.
"""
from __future__ import annotations

import logging
from datetime import datetime

_log = logging.getLogger("lunamoth.messaging.access")


def warn_if_open_allowlist(allowed, channel: str = "") -> bool:
    """Emit a loud WARNING when a messaging gateway starts with an EMPTY allow-list
    (= open: any inbound sender can summon a capable shell/file agent). This is the
    documented default, but on a public channel it's the #1 misconfiguration risk,
    so we make it visible in the log at start. Returns True when the list is open."""
    if not allowed:
        _log.warning(
            "messaging gateway%s started with an OPEN allow-list (empty = anyone "
            "can reach this chara, which has tool access). Set allowed_senders to "
            "restrict it for any non-trusted channel.",
            f" [{channel}]" if channel else "",
        )
        return True
    return False


def sender_allowed(sender_id: str, allowed: set[str]) -> bool:
    """Whether `sender_id` may reach the chara.

    An EMPTY allow-list means OPEN — anyone can summon the chara (this is what
    the gateway pane's field help promises). A non-empty list restricts to its
    members, with ``"*"`` as an explicit wildcard.
    """
    if not allowed:
        return True
    return sender_id in allowed or "*" in allowed


class RefusalThrottle:
    """Emit at most one 'unauthorized sender' refusal per sender per day.

    OneBot redelivers after a reconnect (and any callback platform retries an
    unacked delivery), so an unknown sender can hit us repeatedly; we tell them no once a day, then
    stay silent (audit: never spam, never run a turn for them).
    """

    def __init__(self) -> None:
        self._last_day: dict[str, str] = {}

    def allow(self, sender_id: str) -> bool:
        """Return True at most once per sender per calendar day; the caller
        sends the refusal text when this returns True."""
        today = datetime.now().strftime("%Y-%m-%d")
        if self._last_day.get(sender_id) == today:
            return False
        self._last_day[sender_id] = today
        return True
