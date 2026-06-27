"""Клиент к бэкенду ChatGPT/Codex по подписке (путь B) — без программы Codex.

Шлём запрос напрямую на backend-api/codex/responses, передавая СВОИ instructions
(личность Наоми). Системный промпт под нашим контролем → чистая Наоми, без кодер-подложки.

Эндпоинт/тело/заголовки сняты с живого трафика codex-cli 0.142.2 и проверены вживую
(HTTP 200, ~99 входных токенов). Логин по OAuth и выдача токена — в auth.py.
"""
import asyncio
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
    try:
        os.chmod(path, 0o600)   # в файле OAuth-токены — только владельцу
    except Exception:
        pass


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
    at, acc = tokens.get("access_token"), tokens.get("account_id")
    if not at or not acc:
        raise RuntimeError("not_logged_in")  # нет токена/аккаунта — нужен повторный вход
    return {
        "Authorization": "Bearer " + at,
        "chatgpt-account-id": acc,
        "OpenAI-Beta": "responses=experimental",
        "originator": "codex_cli_rs",
        "User-Agent": f"codex_cli_rs/{CLIENT_VERSION}",
        "session_id": session_id,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }


# Инструмент поиска: модель сама решает, когда искать (бережём лимит Tavily), и
# ОБЯЗАНА формулировать запрос на английском (перевод намерения пользователя).
WEB_SEARCH_TOOL = {
    "type": "function",
    "name": "web_search",
    "description": ("Search the web for current, factual or fresh information (news, prices, versions, "
                    "dates, events, docs — anything that may have changed or you're unsure about). Use it "
                    "whenever up-to-date or external facts would make the answer better. IMPORTANT: the "
                    "`query` MUST be written in ENGLISH — translate the user's intent into a concise English "
                    "query, regardless of the chat language."),
    "parameters": {
        "type": "object",
        "properties": {"query": {"type": "string", "description": "Concise web search query in English"}},
        "required": ["query"],
        "additionalProperties": False,
    },
    "strict": True,
}
MAX_TOOL_HOPS = 4  # до 3 поисков за один ход + финальный ответ


def _body(input_items, instructions, model, effort, verbosity, cache_key, tools) -> dict:
    return {
        "model": model,
        "instructions": instructions,
        "input": input_items,
        "tools": tools,
        "tool_choice": "auto",
        "reasoning": {"effort": effort},
        "store": False,
        "stream": True,
        "include": ["reasoning.encrypted_content"],
        "prompt_cache_key": cache_key,
        "text": {"verbosity": verbosity},
    }


# Один лок на обновление токена: refresh_token одноразовый, параллельные запросы
# не должны гонять его одновременно (иначе второй получит invalid_grant).
_refresh_lock = asyncio.Lock()


async def _fresh_tokens(auth_path):
    # ensure_fresh может сделать СИНХРОННЫЙ refresh (httpx.post, до 30с) — уносим в поток,
    # чтобы не морозить общий event loop (веб-стримы + телеграм-поллер). Лок держим:
    # refresh_token одноразовый, параллельные обновления нельзя.
    async with _refresh_lock:
        return (await asyncio.to_thread(lambda: ensure_fresh(load_tokens(auth_path), auth_path)))["tokens"]


async def _refresh_after_401(auth_path, used_access_token):
    async with _refresh_lock:
        data = load_tokens(auth_path)
        cur = data.get("tokens", {}).get("access_token")
        if cur and cur != used_access_token:
            return data["tokens"]  # уже обновлён другим запросом — берём новый
        return (await asyncio.to_thread(refresh_tokens, data, auth_path))["tokens"]  # sync refresh → в поток


async def _parse_events(resp):
    """Разбор SSE одного ответа: ('delta',t) / ('fc',{call_id,name,arguments}) / ('usage',u) / ('error',ev)."""
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
        elif t == "response.output_item.done" and ev.get("item", {}).get("type") == "function_call":
            it = ev["item"]
            yield ("fc", {"call_id": it.get("call_id"), "name": it.get("name"), "arguments": it.get("arguments") or ""})
        elif t == "response.completed":
            yield ("usage", ev.get("response", {}).get("usage", {}) or {})
        elif t in ("response.failed", "error"):
            yield ("error", ev)


async def _stream_once(client, session_id, body, tok_holder, auth_path):
    """Один запрос к responses (с ретраем 401). tok_holder['tokens'] обновляется при refresh."""
    headers = _headers(tok_holder["tokens"], session_id)
    async with client.stream("POST", RESPONSES_URL, json=body, headers=headers) as r:
        if r.status_code == 401:
            await r.aread()
            tok_holder["tokens"] = await _refresh_after_401(auth_path, tok_holder["tokens"]["access_token"])
            async with client.stream("POST", RESPONSES_URL, json=body, headers=_headers(tok_holder["tokens"], session_id)) as r2:
                r2.raise_for_status()
                async for ev in _parse_events(r2):
                    yield ev
            return
        r.raise_for_status()
        async for ev in _parse_events(r):
            yield ev


def _context_item(note: str) -> dict:
    """Эфемерный блок «реально сейчас» (время + дом). Кладём ПЕРЕД последней репликой
    юзера, помечая, что это не его слова. В историю (CONVO) не сохраняется."""
    return {
        "type": "message",
        "role": "user",
        "content": [{"type": "input_text",
                     "text": "[Контекст · реальное состояние прямо сейчас, обновляется само; "
                             "не реплика собеседника — просто знай и опирайся]\n" + note}],
    }


async def stream_chat(messages, *, instructions, model="gpt-5.5", effort="low",
                      verbosity="medium", cache_key=None, auth_path=AUTH_PATH, search_fn=None,
                      context_note=None):
    """Стримит ответ Наоми. Yield'ит ('delta', text), ('tool', {query}) при поиске, в конце ('done', usage).

    Если передан search_fn — у модели появляется инструмент web_search: она сама решает,
    когда искать, формулирует английский запрос, мы зовём search_fn(query) и возвращаем ей результат.
    context_note (если есть) — эфемерный блок состояния, вставляется перед последней репликой юзера."""
    tok_holder = {"tokens": await _fresh_tokens(auth_path)}
    session_id = str(uuid.uuid4())
    cache_key = cache_key or session_id
    input_items = _to_input(messages)
    if context_note:
        note = _context_item(context_note)
        input_items = (input_items[:-1] + [note] + input_items[-1:]) if input_items else [note]
    tools = [WEB_SEARCH_TOOL] if search_fn else []
    usage = {}

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=15, read=180, write=30, pool=15)) as client:
        for _ in range(MAX_TOOL_HOPS):
            body = _body(input_items, instructions, model, effort, verbosity, cache_key, tools)
            fc = None
            async for kind, payload in _stream_once(client, session_id, body, tok_holder, auth_path):
                if kind == "delta":
                    yield ("delta", payload)
                elif kind == "fc":
                    fc = payload
                elif kind == "usage":
                    usage = payload
                elif kind == "error":
                    yield ("error", payload)
                    return
            if fc and search_fn:
                try:
                    query = (json.loads(fc["arguments"]) or {}).get("query", "")
                except Exception:
                    query = ""
                yield ("tool", {"name": fc.get("name"), "query": query})
                try:
                    output = await search_fn(query)
                except Exception as e:
                    output = json.dumps({"error": str(e)}, ensure_ascii=False)
                input_items = input_items + [
                    {"type": "function_call", "call_id": fc["call_id"], "name": fc["name"], "arguments": fc["arguments"]},
                    {"type": "function_call_output", "call_id": fc["call_id"], "output": output},
                ]
                continue  # новый запрос с результатом поиска
            break

    yield ("done", usage)


async def complete(messages, *, instructions, model="gpt-5.5", effort="low",
                   verbosity="medium", cache_key=None, auth_path=AUTH_PATH, search_fn=None,
                   context_note=None) -> dict:
    """Нестриминговый помощник: собирает полный текст ответа и usage (поиск прозрачен)."""
    text, usage = "", {}
    async for kind, payload in stream_chat(messages, instructions=instructions, model=model,
                                           effort=effort, verbosity=verbosity,
                                           cache_key=cache_key, auth_path=auth_path, search_fn=search_fn,
                                           context_note=context_note):
        if kind == "delta":
            text += payload
        elif kind == "done":
            usage = payload
        elif kind == "error":
            raise RuntimeError(f"backend error: {payload}")
    return {"text": text, "usage": usage}
