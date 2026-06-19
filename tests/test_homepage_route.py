"""The chara personal-website HTTP route: /chara/<name>/home/* serves a chara's
workspace/home/ tree read-only, confined, with a hardened CSP — and never leaks
the session secrets that sit just outside home/."""
from __future__ import annotations

import http.client

import pytest

from lunamoth.server import supervisor as SV
from lunamoth.session import sessions as S


@pytest.fixture()
def home_server(tmp_path, monkeypatch):
    monkeypatch.setenv("LUNAMOTH_HOME", str(tmp_path / "home"))
    meta = S.create_session("webby", isolation="sandbox")
    home = meta.sandbox_dir / "workspace" / "home"
    home.mkdir(parents=True, exist_ok=True)
    (home / "index.html").write_text("<h1>HELLO-FROM-HOME</h1>", encoding="utf-8")
    (home / "app.js").write_text("console.log('hi')", encoding="utf-8")
    # A secret one level up that MUST never be reachable through this route.
    (meta.root / "config.json").write_text('{"api_key":"SECRET-KEY-XYZ"}', encoding="utf-8")
    port = SV.free_port()
    srv = SV.start_http("127.0.0.1", port, token="sekret", supervisor=None)
    try:
        yield port
    finally:
        srv.shutdown()


def _get(port, path, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request("GET", path, headers=headers or {})
    resp = conn.getresponse()
    out = (resp.status, dict(resp.getheaders()), resp.read())
    conn.close()
    return out


def test_home_serves_index_and_assets_with_hardened_csp(home_server):
    status, headers, body = _get(home_server, "/chara/webby/home/index.html?token=sekret")
    assert status == 200
    assert b"HELLO-FROM-HOME" in body
    assert "text/html" in headers.get("Content-Type", "")
    csp = headers.get("Content-Security-Policy", "")
    assert "connect-src 'none'" in csp
    assert "form-action 'none'" in csp
    assert "frame-ancestors 'self'" in csp

    # Bare /home resolves to index.html.
    status, _h, body = _get(home_server, "/chara/webby/home?token=sekret")
    assert status == 200 and b"HELLO-FROM-HOME" in body

    # A linked subresource (the chara's own JS) is served.
    status, _h, body = _get(home_server, "/chara/webby/home/app.js?token=sekret")
    assert status == 200 and b"console.log" in body


def test_home_route_confines_to_home_and_hides_secrets(home_server):
    # Path traversal to the session secret must 404, never leak the key.
    status, _h, body = _get(home_server, "/chara/webby/home/../../config.json?token=sekret")
    assert status == 404
    assert b"SECRET-KEY-XYZ" not in body
    # An unknown chara → 404.
    status, _h, _b = _get(home_server, "/chara/ghost/home/index.html?token=sekret")
    assert status == 404
    # A missing file under home → 404 (not a server error).
    status, _h, _b = _get(home_server, "/chara/webby/home/nope.html?token=sekret")
    assert status == 404


def test_home_route_requires_auth(home_server):
    # No token / cookie → 401 (the route sits behind the same gate as /asset).
    status, _h, _b = _get(home_server, "/chara/webby/home/index.html")
    assert status == 401
