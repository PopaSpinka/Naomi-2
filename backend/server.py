"""Бэкенд Наоми (FastAPI). Один процесс: отдаёт статику фронта и /api/*.

Мозг — oai.py (запрос напрямую в backend-api/codex/responses по подписке, путь B).
Личность — naomi.md + pravila.md в корне проекта (читаются на каждый запрос).
"""
import asyncio
import json
import os
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
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
SESSION_FILE = os.path.join(DATA, "session.json")

DEFAULT_SETTINGS = {"model": "gpt-5.5", "reasoning": "low"}
VERSION = "naomi-0.3.2"

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


# ---------------------------------------------------------------- единый тред + SSE
# Один диалог для веба и телеграма. В ПАМЯТИ → сбрасывается при перезапуске сервера.
CONVO = []
_convo_lock = asyncio.Lock()
_sse_clients = set()  # set[asyncio.Queue]: подключённые веб-клиенты /api/events


async def sse_publish(event: dict):
    """Рассылает событие всем веб-клиентам (live-зеркало телеграма в веб)."""
    data = json.dumps(event, ensure_ascii=False)
    for q in list(_sse_clients):
        try:
            q.put_nowait(data)
        except Exception:
            pass


# ---------------------------------------------------------------- API
@app.post("/api/chat")
async def chat(req: Request):
    try:
        payload = await req.json()
    except Exception:
        return JSONResponse({"error": "bad json"}, status_code=400)
    # сервер ведёт единый тред (CONVO); от клиента берём только новую реплику
    user_text = ""
    for m in reversed(payload.get("messages", [])):
        if m.get("role") == "user" and (m.get("content") or "").strip():
            user_text = m["content"]
            break
    if not user_text:
        return JSONResponse({"error": "no messages"}, status_code=400)

    cfg = load_settings()

    async def gen():
        # Стримим токены Наоми по мере генерации (SSE). Тред под локом — как и нестрим-версия.
        # Веб НЕ зеркалим в телеграм и не публикуем в /api/events (клиент рисует у себя сам).
        async with _convo_lock:
            CONVO.append({"role": "user", "content": user_text})
            full = ""
            try:
                async for kind, part in oai.stream_chat(
                    CONVO,
                    instructions=build_instructions(),
                    model=cfg.get("model", "gpt-5.5"),
                    effort=cfg.get("reasoning", "low"),
                    cache_key=cache_key(),
                ):
                    if kind == "delta" and part:
                        full += part
                        yield "data: " + json.dumps({"t": "delta", "d": part}, ensure_ascii=False) + "\n\n"
                    elif kind == "error":
                        break
            except Exception:
                pass
            full = full.strip()
            if full:
                CONVO.append({"role": "assistant", "content": full})
                yield "data: " + json.dumps({"t": "done"}) + "\n\n"
            else:
                CONVO.pop()  # ничего не пришло — откатываем реплику
                yield "data: " + json.dumps({"t": "error"}) + "\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/api/history")
async def history():
    # единый тред из памяти (после рестарта сервера — пусто)
    return {"messages": CONVO}


@app.post("/api/reset")
async def reset():
    """Полностью очищает общий тред (веб + контекст для телеграма) — Наоми забывает разговор."""
    async with _convo_lock:
        CONVO.clear()   # очистка на месте: телеграм-поллер держит ссылку на этот же список
    return {"ok": True}


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
    """SSE: keepalive + live-зеркало телеграм-сообщений в веб (события 'incoming')."""
    q = asyncio.Queue()
    _sse_clients.add(q)

    async def gen():
        try:
            yield ": connected\n\n"
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=20)
                    yield "data: " + data + "\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            _sse_clients.discard(q)

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/api/docs")
async def docs():
    """Отдаёт DOCUMENTATION.md для вкладки «Документация»."""
    try:
        with open(os.path.join(ROOT, "DOCUMENTATION.md"), "r", encoding="utf-8") as f:
            return {"markdown": f.read()}
    except Exception:
        return {"markdown": ""}


_tg_task = None


@app.on_event("startup")
async def _start_telegram():
    # если телеграм настроен (data/telegram.json) — поднимаем мост в фоне
    global _tg_task
    if telegram.is_configured():
        _tg_task = asyncio.create_task(telegram.run(build_instructions, load_settings, CONVO, _convo_lock, sse_publish))


@app.on_event("shutdown")
async def _stop_telegram():
    # гасим поллер при остановке сервера, иначе он остаётся «осиротевшим» → двойные ответы
    if _tg_task:
        _tg_task.cancel()


@app.get("/")
async def index():
    # index.html — всегда ревалидировать (no-cache), чтобы браузер подхватывал свежий ?v= ассетов
    # и не залипал на старом app.js (иначе старый фронт не понимает новый SSE-стрим).
    return FileResponse(os.path.join(FRONTEND, "index.html"), headers={"Cache-Control": "no-cache"})


# статика фронта монтируется ПОСЛЕ /api/* — ловит всё остальное (ассеты версионированы ?v=хэш)
app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
