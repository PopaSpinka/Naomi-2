"""Собственный вход «Sign in with ChatGPT» (PKCE OAuth) — без программы Codex.

Механика выверена по исходникам openai/codex: authorize/token endpoints, порядок
параметров, S256-PKCE, form-urlencoded обмен кода, запись auth.json в формате codex.
После входа Наоми работает на той же подписке (Bearer access_token).
"""
import base64
import hashlib
import json
import os
import secrets
import threading
import time
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

import httpx

from oai import AUTH_PATH, CLIENT_ID, TOKEN_URL, save_tokens

AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize"
REDIRECT_PORT = 1455
REDIRECT_URI = f"http://localhost:{REDIRECT_PORT}/auth/callback"
SCOPE = "openid profile email offline_access api.connectors.read api.connectors.invoke"

# Состояние текущего входа для опроса из UI: idle | waiting | success | error
_flow = {"status": "idle", "authorize_url": None, "error": None}
_lock = threading.Lock()


def status() -> dict:
    with _lock:
        return dict(_flow)


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _pkce():
    verifier = _b64url(secrets.token_bytes(64))                 # 86 символов
    challenge = _b64url(hashlib.sha256(verifier.encode()).digest())
    return verifier, challenge


def _authorize_url(challenge: str, state: str) -> str:
    params = [
        ("response_type", "code"),
        ("client_id", CLIENT_ID),
        ("redirect_uri", REDIRECT_URI),
        ("scope", SCOPE),
        ("code_challenge", challenge),
        ("code_challenge_method", "S256"),
        ("id_token_add_organizations", "true"),
        ("codex_cli_simplified_flow", "true"),
        ("state", state),
        ("originator", "codex_cli_rs"),
    ]
    return AUTHORIZE_URL + "?" + urllib.parse.urlencode(params)


def _exchange_code(code: str, verifier: str) -> dict:
    # Code-exchange: form-urlencoded (в отличие от refresh — там JSON).
    resp = httpx.post(
        TOKEN_URL,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "client_id": CLIENT_ID,
            "code_verifier": verifier,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _account_id(id_token: str) -> str:
    seg = id_token.split(".")[1]
    seg += "=" * (-len(seg) % 4)
    claims = json.loads(base64.urlsafe_b64decode(seg))
    return claims.get("https://api.openai.com/auth", {}).get("chatgpt_account_id", "")


def _write_auth(tokens: dict, path: str = AUTH_PATH) -> None:
    data = {
        "auth_mode": "chatgpt",
        "OPENAI_API_KEY": None,
        "tokens": {
            "id_token": tokens["id_token"],
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "account_id": _account_id(tokens["id_token"]),
        },
        "last_refresh": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    save_tokens(data, path)
    try:
        os.chmod(path, 0o600)
    except Exception:
        pass


_PAGE_OK = b"<html><body style='font:16px system-ui;text-align:center;padding:60px'><h2>Naomi: \xe2\x9c\x93 \xd0\xb2\xd1\x85\xd0\xbe\xd0\xb4 \xd0\xb2\xd1\x8b\xd0\xbf\xd0\xbe\xd0\xbb\xd0\xbd\xd0\xb5\xd0\xbd</h2><p>\xd0\x9c\xd0\xbe\xd0\xb6\xd0\xbd\xd0\xbe \xd0\xb7\xd0\xb0\xd0\xba\xd1\x80\xd1\x8b\xd1\x82\xd1\x8c \xd1\x8d\xd1\x82\xd1\x83 \xd0\xb2\xd0\xba\xd0\xbb\xd0\xb0\xd0\xb4\xd0\xba\xd1\x83 \xd0\xb8 \xd0\xb2\xd0\xb5\xd1\x80\xd0\xbd\xd1\x83\xd1\x82\xd1\x8c\xd1\x81\xd1\x8f \xd0\xba Naomi.</p></body></html>"
_PAGE_ERR = b"<html><body style='font:16px system-ui;text-align:center;padding:60px'><h2>Naomi: \xe2\x9c\x95 \xd0\xbe\xd1\x88\xd0\xb8\xd0\xb1\xd0\xba\xd0\xb0 \xd0\xb2\xd1\x85\xd0\xbe\xd0\xb4\xd0\xb0</h2></body></html>"


def _run_flow():
    verifier, challenge = _pkce()
    state = _b64url(secrets.token_bytes(32))
    url = _authorize_url(challenge, state)
    with _lock:
        _flow.update(status="waiting", authorize_url=url, error=None)

    result = {"code": None, "ok": False}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            if not parsed.path.startswith("/auth/callback"):
                self.send_response(204)
                self.end_headers()
                return
            q = urllib.parse.parse_qs(parsed.query)
            if q.get("state", [""])[0] != state or q.get("error") or not q.get("code"):
                self.send_response(400)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(_PAGE_ERR)
                return
            result["code"] = q["code"][0]
            result["ok"] = True
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(_PAGE_OK)

    try:
        httpd = HTTPServer(("127.0.0.1", REDIRECT_PORT), Handler)
    except OSError as e:
        with _lock:
            _flow.update(status="error", error=f"порт {REDIRECT_PORT} занят: {e}")
        return

    try:
        webbrowser.open(url)
    except Exception:
        pass

    httpd.timeout = 1
    deadline = time.time() + 300
    while not result["ok"] and time.time() < deadline:
        httpd.handle_request()
    httpd.server_close()

    if not result["ok"]:
        with _lock:
            _flow.update(status="error", error="истекло время ожидания входа")
        return

    try:
        tokens = _exchange_code(result["code"], verifier)
        _write_auth(tokens)
        with _lock:
            _flow.update(status="success", error=None)
    except Exception as e:
        with _lock:
            _flow.update(status="error", error=str(e))


def start_login() -> dict:
    """Запускает вход в фоне. UI опрашивает status() и /api/auth/status."""
    with _lock:
        if _flow["status"] == "waiting":
            return dict(_flow)
        _flow.update(status="waiting", authorize_url=None, error=None)
    threading.Thread(target=_run_flow, daemon=True).start()
    # дождёмся, пока поток выставит authorize_url (до ~2с)
    for _ in range(20):
        with _lock:
            if _flow["authorize_url"] or _flow["status"] == "error":
                return dict(_flow)
        time.sleep(0.1)
    return status()
