"""Бэкенд Наоми (FastAPI). Один процесс: отдаёт статику фронта и /api/*.

Мозг — oai.py (запрос напрямую в backend-api/codex/responses по подписке, путь B).
Личность — naomi.md + pravila.md в корне проекта (читаются на каждый запрос).
"""
import asyncio
import json
import os
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import auth
import oai
import telegram

# --- пути ---
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                      # корень проекта (на уровень выше backend/)
FRONTEND = os.path.join(ROOT, "frontend")
DATA = os.path.join(HERE, "data")
os.makedirs(DATA, exist_ok=True)

NAOMI_MD = os.path.join(ROOT, "naomi.md")
PRAVILA_MD = os.path.join(ROOT, "pravila.md")
SETTINGS_FILE = os.path.join(DATA, "settings.json")
HISTORY_FILE = os.path.join(DATA, "history.json")
SESSION_FILE = os.path.join(DATA, "session.json")

DEFAULT_SETTINGS = {"model": "gpt-5.5", "reasoning": "low"}
VERSION = "naomi-0.2.0"

app = FastAPI()


# ---------------------------------------------------------------- утилиты состояния
def _read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def load_settings():
    return {**DEFAULT_SETTINGS, **_read_json(SETTINGS_FILE, {})}


def build_instructions() -> str:
    """Личность Наоми = naomi.md + pravila.md. Читаем каждый раз — правки сразу в деле."""
    parts = []
    for p in (NAOMI_MD, PRAVILA_MD):
        try:
            with open(p, "r", encoding="utf-8") as f:
                t = f.read().strip()
                if t:
                    parts.append(t)
        except Exception:
            pass
    return "\n\n".join(parts) if parts else "Тебя зовут Наоми."


def cache_key() -> str:
    """Стабильный prompt_cache_key на сессию — держит префикс в кеше сервера."""
    s = _read_json(SESSION_FILE, None)
    if not s or "cache_key" not in s:
        s = {"cache_key": str(uuid.uuid4())}
        _write_json(SESSION_FILE, s)
    return s["cache_key"]


# ---------------------------------------------------------------- API
@app.post("/api/chat")
async def chat(req: Request):
    try:
        payload = await req.json()
    except Exception:
        return JSONResponse({"error": "bad json"}, status_code=400)
    messages = [
        {"role": m.get("role", "user"), "content": m.get("content", "")}
        for m in payload.get("messages", [])
        if m.get("role") in ("user", "assistant")
    ]
    if not messages:
        return JSONResponse({"error": "no messages"}, status_code=400)

    cfg = load_settings()
    try:
        result = await oai.complete(
            messages,
            instructions=build_instructions(),
            model=cfg.get("model", "gpt-5.5"),
            effort=cfg.get("reasoning", "low"),
            cache_key=cache_key(),
        )
    except Exception:
        # детали наружу не отдаём (могут утечь upstream-URL и пр.)
        return JSONResponse({"error": "upstream error"}, status_code=502)

    text = (result.get("text") or "").strip()
    if not text:
        # пустой ответ модели → фронт покажет «не получила ответ», пустой пузырь не создаём
        return JSONResponse({"error": "empty reply"}, status_code=502)
    # сохраняем видимую историю для восстановления после перезагрузки страницы
    _write_json(HISTORY_FILE, {"messages": messages + [{"role": "assistant", "content": text}]})
    return {"reply": text, "thought": cfg.get("reasoning", "low") != "off", "usage": result.get("usage")}


@app.get("/api/history")
async def history():
    return _read_json(HISTORY_FILE, {"messages": []})


@app.get("/api/settings")
async def get_settings():
    return load_settings()


@app.post("/api/settings")
async def set_settings(req: Request):
    try:
        body = await req.json()
    except Exception:
        return JSONResponse({"error": "bad json"}, status_code=400)
    cfg = load_settings()
    for k in ("model", "reasoning"):
        if k in body:
            cfg[k] = body[k]
    # фронт исторически шлёт chatReasoning — принимаем и его
    if "chatReasoning" in body:
        cfg["reasoning"] = body["chatReasoning"]
    _write_json(SETTINGS_FILE, cfg)
    return cfg


@app.get("/api/health")
async def health():
    return {"version": VERSION, "ok": True}


@app.get("/api/auth/status")
async def auth_status():
    return {**oai.auth_status(), "login": auth.status()}


@app.post("/api/auth/login")
async def auth_login():
    """Запускает вход «Sign in with ChatGPT» (открывает браузер). Возвращает authorize_url."""
    return auth.start_login()


@app.get("/api/events")
async def events():
    """SSE-keepalive: фронт держит EventSource открытым. Пока шлём только пинги."""
    async def gen():
        yield ": connected\n\n"
        while True:
            await asyncio.sleep(20)
            yield ": ping\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/api/docs")
async def docs():
    """Отдаёт DOCUMENTATION.md для вкладки «Документация»."""
    try:
        with open(os.path.join(ROOT, "DOCUMENTATION.md"), "r", encoding="utf-8") as f:
            return {"markdown": f.read()}
    except Exception:
        return {"markdown": ""}


@app.on_event("startup")
async def _start_telegram():
    # если телеграм настроен (data/telegram.json) — поднимаем мост в фоне
    if telegram.is_configured():
        asyncio.create_task(telegram.run(build_instructions, load_settings))


# статика фронта монтируется ПОСЛЕ /api/* — ловит всё остальное
app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
