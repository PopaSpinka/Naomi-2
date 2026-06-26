"""Клиент к бэкенду ChatGPT/Codex по подписке (путь B) — без программы Codex.

Шлём запрос напрямую на backend-api/codex/responses, передавая СВОИ instructions
(личность Наоми). Системный промпт под нашим контролем → чистая Наоми, без кодер-подложки.

Эндпоинт/тело/заголовки сняты с живого трафика codex-cli 0.142.2 и проверены вживую
(HTTP 200, ~99 входных токенов). Логин по OAuth и выдача токена — в auth.py.
"""
import base64
import json
import os
import time
import uuid

import httpx

# --- константы (выверены по токену и трафику codex) ---
CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
ISSUER = "https://auth.openai.com"
TOKEN_URL = f"{ISSUER}/oauth/token"
RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses"
CLIENT_VERSION = "0.142.2"

# По умолчанию переиспользуем уже залогиненный кэш codex; auth.py может указать свой путь.
AUTH_PATH = os.environ.get("NAOMI_AUTH_PATH", os.path.expanduser("~/.codex/auth.json"))


# ---------------------------------------------------------------- токены
def load_tokens(path: str = AUTH_PATH) -> dict:
    """Читает auth.json (формат codex): {auth_mode, tokens:{access_token, refresh_token,
    id_token, account_id}, last_refresh}."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_tokens(data: dict, path: str = AUTH_PATH) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def _jwt_exp(token: str) -> int:
    """Достаёт exp (unix-время) из JWT, не проверяя подпись."""
    try:
        seg = token.split(".")[1]
        seg += "=" * (-len(seg) % 4)
        payload = json.loads(base64.urlsafe_b64decode(seg))
        return int(payload.get("exp", 0))
    except Exception:
        return 0


def refresh_tokens(data: dict, path: str = AUTH_PATH) -> dict:
    """Обновляет access_token по refresh_token (стандартный OAuth refresh).

    Точные поля выверяются по исходникам openai/codex; форма ниже — каноническая
    для этого OAuth-клиента."""
    rt = data["tokens"]["refresh_token"]
    # Официальная форма Codex: JSON, ровно 3 поля, БЕЗ scope. refresh_token одноразовый.
    resp = httpx.post(
        TOKEN_URL,
        headers={"Content-Type": "application/json"},
        json={
            "client_id": CLIENT_ID,
            "grant_type": "refresh_token",
            "refresh_token": rt,
        },
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()
    tok = data.setdefault("tokens", {})
    if body.get("access_token"):
        tok["access_token"] = body["access_token"]
    if body.get("id_token"):
        tok["id_token"] = body["id_token"]
    if body.get("refresh_token"):
        tok["refresh_token"] = body["refresh_token"]
    data["last_refresh"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    save_tokens(data, path)
    return data


def ensure_fresh(data: dict, path: str = AUTH_PATH, skew: int = 300) -> dict:
    """Если access_token истекает в ближайшие `skew` секунд (окно Codex — 5 мин) — обновляет."""
    at = data.get("tokens", {}).get("access_token", "")
    if not at or _jwt_exp(at) - time.time() < skew:
        try:
            data = refresh_tokens(data, path)
        except Exception:
            # Не смогли обновить — отдаём как есть; вызывающий обработает 401.
            pass
    return data


def auth_status(path: str = AUTH_PATH) -> dict:
    """Короткий статус для UI: залогинен ли, план, когда истекает токен."""
    try:
        data = load_tokens(path)
    except Exception:
        return {"logged_in": False}
    at = data.get("tokens", {}).get("access_token", "")
    try:
        seg = at.split(".")[1]
        seg += "=" * (-len(seg) % 4)
        claims = json.loads(base64.urlsafe_b64decode(seg))
        plan = claims.get("https://api.openai.com/auth", {}).get("chatgpt_plan_type")
    except Exception:
        plan = None
    return {
        "logged_in": bool(at),
        "plan": plan,
        "expires_at": _jwt_exp(at),
        "account_id": bool(data.get("tokens", {}).get("account_id")),
    }


# ---------------------------------------------------------------- чат
def _to_input(messages: list[dict]) -> list[dict]:
    """[{role, content}] → формат Responses API input[]."""
    out = []
    for m in messages:
        role = m.get("role", "user")
        kind = "output_text" if role == "assistant" else "input_text"
        out.append({
            "type": "message",
            "role": role,
            "content": [{"type": kind, "text": m.get("content", "")}],
        })
    return out


def _headers(tokens: dict, session_id: str) -> dict:
    return {
        "Authorization": "Bearer " + tokens["access_token"],
        "chatgpt-account-id": tokens["account_id"],
        "OpenAI-Beta": "responses=experimental",
        "originator": "codex_cli_rs",
        "User-Agent": f"codex_cli_rs/{CLIENT_VERSION}",
        "session_id": session_id,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }


def _body(messages, instructions, model, effort, verbosity, cache_key) -> dict:
    return {
        "model": model,
        "instructions": instructions,
        "input": _to_input(messages),
        "tools": [],
        "tool_choice": "auto",
        "reasoning": {"effort": effort},
        "store": False,
        "stream": True,
        "include": ["reasoning.encrypted_content"],
        "prompt_cache_key": cache_key,
        "text": {"verbosity": verbosity},
    }


async def stream_chat(messages, *, instructions, model="gpt-5.5", effort="low",
                      verbosity="medium", cache_key=None, auth_path=AUTH_PATH):
    """Стримит ответ Наоми. Yield'ит кортежи ('delta', text) и в конце ('done', usage).

    cache_key — стабильный id диалога: одинаковый ключ держит префикс в кеше сервера
    (ниже латентность). Сессия → один ключ."""
    data = ensure_fresh(load_tokens(auth_path), auth_path)
    tokens = data["tokens"]
    session_id = str(uuid.uuid4())
    cache_key = cache_key or session_id
    body = _body(messages, instructions, model, effort, verbosity, cache_key)
    headers = _headers(tokens, session_id)

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=15, read=180, write=30, pool=15)) as client:
        async with client.stream("POST", RESPONSES_URL, json=body, headers=headers) as r:
            if r.status_code == 401:
                # токен протух между проверкой и запросом — обновим и повторим один раз
                await r.aread()
                data = refresh_tokens(load_tokens(auth_path), auth_path)
                headers = _headers(data["tokens"], session_id)
                async with client.stream("POST", RESPONSES_URL, json=body, headers=headers) as r2:
                    r2.raise_for_status()
                    async for item in _parse_sse(r2):
                        yield item
                    return
            r.raise_for_status()
            async for item in _parse_sse(r):
                yield item


async def _parse_sse(resp):
    async for line in resp.aiter_lines():
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if data == "[DONE]":
            break
        try:
            ev = json.loads(data)
        except Exception:
            continue
        t = ev.get("type", "")
        if t == "response.output_text.delta":
            yield ("delta", ev.get("delta", ""))
        elif t == "response.completed":
            usage = ev.get("response", {}).get("usage", {}) or {}
            yield ("done", usage)
        elif t in ("response.failed", "error"):
            yield ("error", ev)


async def complete(messages, *, instructions, model="gpt-5.5", effort="low",
                   verbosity="medium", cache_key=None, auth_path=AUTH_PATH) -> dict:
    """Нестриминговый помощник: собирает полный текст ответа и usage."""
    text, usage = "", {}
    async for kind, payload in stream_chat(messages, instructions=instructions, model=model,
                                           effort=effort, verbosity=verbosity,
                                           cache_key=cache_key, auth_path=auth_path):
        if kind == "delta":
            text += payload
        elif kind == "done":
            usage = payload
        elif kind == "error":
            raise RuntimeError(f"backend error: {payload}")
    return {"text": text, "usage": usage}
