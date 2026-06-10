from __future__ import annotations

import argparse
import select
import sys
import time
from dataclasses import dataclass

from .agent import LunaMothAgent
from .config import ThoughtConfig
from .cleanup import clean_runtime_sandbox


from .themes import LUNAMOTH_BANNER

BANNER = (
    LUNAMOTH_BANNER
    + "\nLUNAMOTH // LOCAL AGENTIC CHARACTER RUNTIME"
    + "\nHuman input interrupts the display stream. /help for commands. Ctrl-C to quit.\n"
)

STDIN_ACTIVE = True


@dataclass
class TerminalState:
    running: bool = True
    eternal: bool = True


def _stdin_line_ready() -> bool:
    if not STDIN_ACTIVE:
        return False
    r, _, _ = select.select([sys.stdin], [], [], 0)
    return bool(r)


def _read_line() -> str | None:
    global STDIN_ACTIVE
    if not _stdin_line_ready():
        return None
    line = sys.stdin.readline()
    if line == "":
        STDIN_ACTIVE = False
        return None
    return line.rstrip("\n")


def _prompt() -> None:
    print('\noperator> ', end='', flush=True)


def _stream_with_interrupt(prefix: str, chunks, allow_interrupt: bool = True) -> tuple[str, str | None]:
    print(prefix, end='', flush=True)
    full: list[str] = []
    for chunk in chunks:
        if allow_interrupt and _stdin_line_ready():
            line = _read_line()
            print("\n\x1b[31m[INTERRUPT: operator input overrides current cycle]\x1b[0m", flush=True)
            return "".join(full), line
        print(chunk, end='', flush=True)
        full.append(chunk)
    print('', flush=True)
    return "".join(full), None


def _cooldown(seconds: float) -> str | None:
    end = time.monotonic() + max(0.0, seconds)
    while time.monotonic() < end:
        if _stdin_line_ready():
            return _read_line()
        time.sleep(min(0.05, end - time.monotonic()))
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='LunaMoth plain terminal mode (legacy; the TUI is the default)')
    parser.add_argument('--no-think', action='store_true', help='disable eternal visible thought cycles')
    parser.add_argument('--cooldown', type=float, default=0.5, help='seconds to pause after each thought/user reply before forced restart')
    parser.add_argument('--no-stream', action='store_true', help='use non-streaming fallback output')
    parser.add_argument('--clean-on-exit', action='store_true', help='wipe the session sandbox on shutdown (default: persist)')
    parser.add_argument('--no-clean-on-exit', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    cfg = ThoughtConfig()
    state = TerminalState(eternal=not args.no_think and cfg.enabled_default)
    cooldown = float(args.cooldown)
    agent = LunaMothAgent()
    session = agent.make_session()
    name = agent.char_name()
    reply_pfx, think_pfx = f"{name}> ", f"{name}~ "

    print(BANNER)
    greeting = agent.greeting()
    if greeting:
        # SillyTavern first_mes: shown as the opening line without an LLM call.
        print(f"{reply_pfx}{greeting}", flush=True)
        session.context.add("assistant", greeting)
    else:
        probe = "你是谁？只用一句话回答。" if agent.lang == "zh" else "Who are you? Answer in one sentence."
        _stream_with_interrupt(reply_pfx, agent.stream_handle(probe, session), allow_interrupt=False)
    pending_line: str | None = None
    _prompt()

    try:
        while state.running:
            if pending_line is None and _stdin_line_ready():
                pending_line = _read_line()
            if pending_line is not None:
                line = pending_line
                pending_line = None
                if line is None:
                    continue
                stripped = line.strip()
                if stripped in {'/quit', '/exit'}:
                    print('shutting down.')
                    break
                if stripped == '/toggle_think':
                    state.eternal = not state.eternal
                    print(f'eternal thinking = {state.eternal}')
                    _prompt()
                    continue
                if stripped == '/pause_think':
                    state.eternal = False
                    print('eternal thinking = False')
                    _prompt()
                    continue
                if stripped == '/resume_think':
                    state.eternal = True
                    print('eternal thinking = True')
                    _prompt()
                    continue
                if stripped.startswith('/set_cooldown '):
                    try:
                        cooldown = max(0.0, float(stripped.split(maxsplit=1)[1]))
                        print(f'cooldown = {cooldown}s')
                    except Exception as e:
                        print(f'bad cooldown: {e}')
                    _prompt()
                    continue
                if stripped == '/help':
                    print('/status /memory /memory_path /files /read <file> /write <file> <text> /logs /reset /toggle_think /pause_think /resume_think /set_cooldown <sec> /exit')
                    _prompt()
                    continue
                _, interrupt = _stream_with_interrupt(reply_pfx, agent.stream_handle(line, session), allow_interrupt=True)
                if interrupt is not None:
                    pending_line = interrupt
                    continue
                pending_line = _cooldown(cooldown)
                _prompt()
                continue

            if state.eternal:
                print("\n\x1b[2m[internal cycle]\x1b[0m", flush=True)
                _, interrupt = _stream_with_interrupt(think_pfx, agent.stream_think(session), allow_interrupt=True)
                if interrupt is not None:
                    pending_line = interrupt
                    continue
                pending_line = _cooldown(cooldown)
                _prompt()
            else:
                pending_line = _cooldown(0.1)
    except KeyboardInterrupt:
        print('\n[interrupted]')
    finally:
        if args.clean_on_exit:
            try:
                clean_runtime_sandbox(clear_memory=True)
                print('\n[runtime sandbox cleaned]')
            except Exception as e:
                print(f'\n[sandbox cleanup failed: {e}]')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
