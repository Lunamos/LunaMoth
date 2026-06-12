from __future__ import annotations

import abc
import queue
from collections.abc import Callable
from dataclasses import dataclass


class DeliveryDeferred(RuntimeError):
    """A visible non-delivery that should not stop the gateway loop.

    This is for platform rules such as "the human must message first" where no
    fallback route exists, but continuing to listen is the correct behavior.
    """


@dataclass(frozen=True)
class InboundMessage:
    """Normalized inbound item pushed by adapters.

    `sender_id` is the stable platform/user id used for allowlisting.  `reply`
    lets callback-style transports remember a per-message destination; direct
    adapters may ignore it and send to their current configured recipient.
    `message_id` is the platform's message id when one exists (WeCom MsgId,
    OneBot message_id): the gateway dedups redeliveries on it, so a retried
    callback or a post-reconnect redelivery never runs a second LLM turn.
    Empty = no platform id = never deduplicated.
    """

    sender_id: str
    sender_name: str
    text: str
    reply: object | None = None
    message_id: str = ""


class Adapter(abc.ABC):
    """Small AstrBot-style seam for messaging platforms.

    `run()` owns platform I/O and pushes normalized :class:`InboundMessage`
    objects into the shared inbox.  `send()` emits text back to the platform.
    """

    @property
    @abc.abstractmethod
    def name(self) -> str:
        raise NotImplementedError

    @abc.abstractmethod
    def run(self, inbox: "queue.Queue[InboundMessage]") -> None:
        raise NotImplementedError

    @abc.abstractmethod
    def send(self, text: str) -> None:
        raise NotImplementedError

    def set_reply_target(self, message: InboundMessage) -> None:
        """Select the destination for sends caused by one inbound message.

        Most adapters can ignore this and keep their own current recipient.
        Direct chat adapters use it so replies go to the inbound sender while
        unattended speak output can still use their configured default peer.
        """

    def clear_reply_target(self) -> None:
        """Clear the per-inbound destination selected by :meth:`set_reply_target`."""

    def close(self) -> None:
        """Stop platform I/O. Adapters with background servers override this."""


AdapterFactory = Callable[[dict], Adapter]
