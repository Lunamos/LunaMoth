"""The launcher / roster — what `lunamoth` opens to.

Unlike Hermes or Claude Code, LunaMoth does NOT drop you into a fresh throwaway
session. Each session is a persistent digital agent. So the default view is a
*roster* of your agents (resume-first): pick one to attach, or deliberately
create a new one (which then goes through setup). A blue LunaMoth splash plays
on entry.

`LauncherApp().run()` returns one of:
    ("attach", name) | ("new", None) | ("start_all", None) | ("stop", name) | None
The CLI acts on the result; this screen never launches a session itself.
"""
from __future__ import annotations

import datetime as _dt

from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Center, Vertical
from textual.widgets import ListItem, ListView, Static

from . import art
from . import sessions as S

_STATUS_STYLE = {
    "attached": ("◆", "#eafaff"),   # a live TUI is open
    "running": ("●", "#7fe0c0"),    # background daemon thinking/creating
    "idle": ("○", "#6f8a99"),       # configured, not running
    "new": ("·", "#c8a86a"),        # never set up
}


def _ago(ts: float) -> str:
    if not ts:
        return "—"
    delta = _dt.datetime.now() - _dt.datetime.fromtimestamp(ts)
    s = int(delta.total_seconds())
    if s < 60:
        return "just now"
    if s < 3600:
        return f"{s // 60}m ago"
    if s < 86400:
        return f"{s // 3600}h ago"
    return f"{s // 86400}d ago"


class LauncherApp(App):
    CSS = """
    Screen { background: #04070b; align: center top; }
    #splash { width: auto; height: auto; margin-top: 1; }
    #wordmark { width: auto; content-align: center middle; }
    #tagline { width: 100%; content-align: center middle; margin-bottom: 1; }
    #roster {
        width: 72; max-width: 96%; height: auto; max-height: 70%;
        border: round #2f5468; padding: 0 1; background: #060b12;
    }
    #roster > ListItem { padding: 0 1; }
    #roster > ListItem.--highlight { background: #0e2536; }
    #hint { width: 72; max-width: 96%; content-align: center middle; color: #5f7d8c; margin-top: 1; }
    """

    BINDINGS = [
        Binding("enter", "attach", "Attach", show=True),
        Binding("n", "new", "New chara", show=True),
        Binding("s", "start_all", "Start all", show=True),
        Binding("x", "stop", "Stop", show=True),
        Binding("r", "refresh", "Refresh", show=False),
        Binding("q,escape", "quit_launcher", "Quit", show=True),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._frames: list[str] = []
        self._frame = 0
        self._compact = False

    def compose(self) -> ComposeResult:
        with Vertical(id="splash"):
            yield Static(id="wordmark")
            yield Static(art.tagline(), id="tagline")
        with Center():
            yield ListView(id="roster")
        yield Static(self._hint_text(), id="hint")

    def on_mount(self) -> None:
        self._compact = self.size.width < art.wordmark_width() + 4
        wm = self.query_one("#wordmark", Static)
        wm.update(art.wordmark(self._compact))
        self._frames = art.sweep_frames(self._compact)
        self._frame = 0
        self.set_interval(0.05, self._tick_sweep)
        self._reload()

    def _tick_sweep(self) -> None:
        if self._frame >= len(self._frames):
            return
        self.query_one("#wordmark", Static).update(self._frames[self._frame])
        self._frame += 1

    def _hint_text(self) -> Text:
        t = Text(justify="center")
        t.append("↑↓ ", style="#9fd9ff"); t.append("select   ", style="#5f7d8c")
        t.append("⏎ ", style="#9fd9ff"); t.append("attach   ", style="#5f7d8c")
        t.append("n ", style="#9fd9ff"); t.append("new   ", style="#5f7d8c")
        t.append("s ", style="#9fd9ff"); t.append("start all   ", style="#5f7d8c")
        t.append("x ", style="#9fd9ff"); t.append("stop   ", style="#5f7d8c")
        t.append("q ", style="#9fd9ff"); t.append("quit", style="#5f7d8c")
        return t

    def _reload(self) -> None:
        lv = self.query_one("#roster", ListView)
        idx = lv.index
        lv.clear()
        rows = S.list_sessions()
        if not rows:
            lv.append(ListItem(Static(Text("no chara yet — press  n  to summon one", style="#6f8a99")), name="__none__"))
        for meta in rows:
            lv.append(ListItem(Static(self._row_text(meta)), name=meta.name))
        if rows:
            lv.index = min(idx or 0, len(rows) - 1)

    def _row_text(self, meta: S.SessionMeta) -> Text:
        status = meta.status()
        glyph, color = _STATUS_STYLE.get(status, ("·", "#888888"))
        t = Text()
        t.append(f"{glyph} ", style=color)
        t.append(f"{meta.name:<16}", style="bold #dfeefa")
        t.append(f"{meta.character_label():<22}", style="#9fd9ff")
        t.append(f"{status:<9}", style=color)
        t.append(f"{meta.isolation:<8}", style="#5f7d8c")
        t.append(_ago(meta.last_active or meta.created_at), style="#5f7d8c")
        return t

    # ---- actions ----------------------------------------------------------

    def _selected(self) -> str | None:
        lv = self.query_one("#roster", ListView)
        item = lv.highlighted_child
        if item is None or item.name in (None, "__none__"):
            return None
        return item.name

    def action_attach(self) -> None:
        name = self._selected()
        if name:
            self.exit(("attach", name))

    def action_new(self) -> None:
        self.exit(("new", None))

    def action_start_all(self) -> None:
        self.exit(("start_all", None))

    def action_stop(self) -> None:
        name = self._selected()
        if name:
            self.exit(("stop", name))

    def action_refresh(self) -> None:
        self._reload()

    def action_quit_launcher(self) -> None:
        self.exit(None)

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        if event.item is not None and event.item.name not in (None, "__none__"):
            self.exit(("attach", event.item.name))
