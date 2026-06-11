"""Desktop hub gateway: roster RPC, wake/freeze, defaults, drafts (server/hub.py).

Everything runs against a temp LUNAMOTH_HOME; no network, no LLM (provider
HTTP paths are exercised separately / mocked here)."""
import json

import pytest

from lunamoth.server import hub as H
from lunamoth.session import sessions as S


@pytest.fixture(autouse=True)
def temp_home(tmp_path, monkeypatch):
    monkeypatch.setenv("LUNAMOTH_HOME", str(tmp_path / "home"))
    yield tmp_path / "home"


def dispatch(method, params=None):
    out = []
    d = H.HubDispatcher(lambda f: out.append(f) or True)
    resp = d.dispatch({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}})
    return resp


def result(method, params=None):
    resp = dispatch(method, params)
    assert "error" not in resp, resp.get("error")
    return resp["result"]


def rpc_error(method, params=None):
    resp = dispatch(method, params)
    assert "error" in resp, resp
    return resp["error"]


def luna_card_path():
    return str(H.bundled_cards_dir() / "LunaMoth.zh.json")


def set_defaults():
    H.save_defaults({"provider": "openrouter", "base_url": "https://example.invalid/v1",
                     "api_key": "sk-test", "model": "test/model"})


# ---- hub.state & defaults -----------------------------------------------------

def test_state_first_run_and_cards():
    r = result("hub.state")
    assert r["first_run"] is True
    assert r["sessions"] == []
    names = {c["name"] for c in r["cards"]}
    assert "月蛾" in names  # bundled deck is visible
    assert r["defaults"]["has_key"] is False


def test_defaults_never_echo_the_key():
    set_defaults()
    r = result("defaults.get")
    assert r["has_key"] is True
    assert "api_key" not in r
    raw = json.loads(H.desktop_config_path().read_text(encoding="utf-8"))
    assert raw["api_key"] == "sk-test"  # stored, just never echoed


def test_defaults_set_ignores_unknown_fields():
    r = result("defaults.set", {"provider": "openrouter", "evil": "x", "ui_lang": "zh"})
    assert r["provider"] == "openrouter"
    assert "evil" not in r


# ---- wake (instantiation) ------------------------------------------------------

def test_wake_freezes_card_and_writes_config():
    set_defaults()
    entry = result("session.wake", {"card": luna_card_path(), "isolation": "sandbox"})
    assert entry["char_name"] == "月蛾"
    assert entry["status"] == "idle"
    meta = S.load_session(entry["name"])
    assert meta is not None
    frozen = meta.root / "card.json"
    assert frozen.exists()
    assert (meta.root / "card_source").read_text(encoding="utf-8") == luna_card_path()
    cfg = json.loads(meta.config_path.read_text(encoding="utf-8"))
    assert cfg["character_path"] == str(frozen)
    assert cfg["api_key"] == "sk-test"
    assert cfg["toolpack"] == "sandbox"  # from the card's extensions.lunamoth
    assert cfg["py_backend"] == "sandbox"


def test_wake_without_model_config_is_refused():
    err = rpc_error("session.wake", {"card": luna_card_path()})
    assert "no model configured" in err["message"]


def test_wake_twice_gets_distinct_names_and_freezes_deck_card():
    set_defaults()
    a = result("session.wake", {"card": luna_card_path()})
    b = result("session.wake", {"card": luna_card_path()})
    assert a["name"] != b["name"]
    cards = result("cards.list")
    luna = next(c for c in cards if c["path"] == luna_card_path())
    assert luna["frozen"] is True
    assert set(luna["used_by"]) == {a["name"], b["name"]}


# ---- delete / export -----------------------------------------------------------

def test_delete_requires_exact_confirmation():
    set_defaults()
    entry = result("session.wake", {"card": luna_card_path()})
    err = rpc_error("session.delete", {"name": entry["name"], "confirm": "nope"})
    assert err["code"] == -32034
    result("session.delete", {"name": entry["name"], "confirm": entry["name"]})
    assert S.load_session(entry["name"]) is None


def test_export_zips_the_whole_session(tmp_path, monkeypatch):
    set_defaults()
    monkeypatch.setattr(H.Path, "home", classmethod(lambda cls: tmp_path))
    entry = result("session.wake", {"card": luna_card_path()})
    meta = S.load_session(entry["name"])
    (meta.sandbox_dir / "workspace").mkdir(parents=True, exist_ok=True)
    (meta.sandbox_dir / "workspace" / "art.txt").write_text("aurora", encoding="utf-8")
    r = result("session.export", {"name": entry["name"]})
    assert r["path"].endswith(".zip")
    import zipfile

    names = zipfile.ZipFile(r["path"]).namelist()
    assert any(n.endswith("workspace/art.txt") for n in names)
    assert any(n.endswith("card.json") for n in names)


# ---- cards: drafts, save, delete ------------------------------------------------

def test_card_from_draft_roundtrip():
    draft = {
        "name": "白枢", "appearance": "修复师。", "personality": "温和而固执。",
        "scenario": "长夜图书馆。", "first_mes": "轻一点关门。",
        "alternate_greetings": ["你来了。"],
        "world": [{"key": "长夜图书馆", "desc": "只在日落后开门。", "constant": True}],
        "relationship": "你是少数能进工作间的访客。",
        "goals": ["补完《长夜目录》"], "rules": "", "toolpack_hint": "sandbox",
    }
    r = result("card.from_draft", {"draft": draft, "origin": "深夜图书馆修书人", "as_draft": True})
    card = json.loads((H.user_cards_dir() / "白枢.json").read_text(encoding="utf-8")) \
        if (H.user_cards_dir() / "白枢.json").exists() else json.loads(open(r["path"], encoding="utf-8").read())
    data = card["data"]
    assert data["name"] == "白枢"
    assert data["first_mes"] == "轻一点关门。"
    assert data["character_book"]["entries"][0]["keys"] == ["长夜图书馆"]
    assert data["extensions"]["lunamoth"]["toolpack"] == "sandbox"
    assert data["extensions"]["lunamoth"]["draft"] is True
    assert data["extensions"]["lunamoth"]["origin"] == "深夜图书馆修书人"
    listed = result("cards.list")
    mine = next(c for c in listed if c["name"] == "白枢")
    assert mine["draft"] is True and mine["builtin"] is False


def test_builtin_cards_cannot_be_deleted():
    err = rpc_error("card.delete", {"path": luna_card_path()})
    assert err["code"] == -32031


def test_referenced_card_cannot_be_deleted():
    set_defaults()
    draft = {"name": "T", "appearance": "x", "personality": "", "scenario": "",
             "first_mes": "hi", "alternate_greetings": [], "world": [],
             "relationship": "", "goals": [], "rules": "", "toolpack_hint": ""}
    r = result("card.from_draft", {"draft": draft})
    result("session.wake", {"card": r["path"]})
    err = rpc_error("card.delete", {"path": r["path"]})
    assert err["code"] == -32032


# ---- works & extras --------------------------------------------------------------

def test_works_list_reads_sandbox_tree():
    set_defaults()
    entry = result("session.wake", {"card": luna_card_path()})
    meta = S.load_session(entry["name"])
    ws = meta.sandbox_dir / "workspace" / "gallery"
    ws.mkdir(parents=True)
    (ws / "aurora.html").write_text("<html>", encoding="utf-8")
    (meta.sandbox_dir / "logs").mkdir(exist_ok=True)
    (meta.sandbox_dir / "logs" / "noise.log").write_text("x", encoding="utf-8")
    works = result("works.list", {"name": entry["name"]})
    names = [w["name"] for w in works]
    assert "aurora.html" in names
    assert "noise.log" not in names  # logs are diagnostics, not works
    assert works[0]["kind"] == "web"


def test_open_path_refuses_outside_home():
    err = rpc_error("open.path", {"path": "/etc/hosts"})
    assert err["code"] in (-32040, -32041)


# ---- error classification ---------------------------------------------------------

def test_http_error_classification():
    assert H._classify_http_error(401, "")["kind"] == "auth"
    assert H._classify_http_error(402, "")["kind"] == "credit"
    assert H._classify_http_error(500, "Insufficient credits")["kind"] == "credit"
    assert H._classify_http_error(429, "")["kind"] == "ratelimit"
    assert H._classify_http_error(404, "")["kind"] == "model"


def test_unknown_method_is_a_clean_rpc_error():
    err = rpc_error("nope.nothing")
    assert err["code"] == -32601
