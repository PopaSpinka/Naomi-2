"""Телеграм-мост Наоми. Long-poll getUpdates → ответ через ту же личность (oai.complete).

Токен и chat_id лежат в data/telegram.json (в .gitignore — в репозиторий не попадают).
Отвечаем только владельцу (chat_id из конфига). История — скользящая, в памяти процесса.
"""
import asyncio
import json
import os

import httpx

import oai
import search

CFG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "telegram.json")
API = "https://api.telegram.org/bot{token}/{method}"
MSG_LIMIT = 4000


def load_cfg():
    try:
        with open(CFG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def is_configured() -> bool:
    c = load_cfg()
    return bool(c and c.get("token"))


async def _api(client, token, method, **params):
    r = await client.post(API.format(token=token, method=method), json=params)
    return r.json()


async def _send(client, token, chat_id, text):
    # Телеграм режет длинные сообщения — бьём на куски.
    text = text or "…"
    for i in range(0, len(text), MSG_LIMIT):
        await _api(client, token, "sendMessage", chat_id=chat_id, text=text[i:i + MSG_LIMIT])


async def run(get_instructions, get_settings, convo, lock, publish):
    """Запускается из server.py на старте.

    convo  — общий тред (список) веба и телеграма; lock — сериализует ход;
    publish(event) — отправляет событие в веб через SSE (зеркало телеграма в веб).
    """
    cfg = load_cfg()
    if not cfg or not cfg.get("token"):
        return
    token = cfg["token"]
    allowed = str(cfg.get("chat_id", "")).strip()

    timeout = httpx.Timeout(connect=10, read=40, write=20, pool=10)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            # сбрасываем только webhook; накопленные сообщения НЕ дропаем — ответим на них
            await _api(client, token, "deleteWebhook", drop_pending_updates=False)
        except Exception:
            pass
        if allowed:
            try:
                await _send(client, token, allowed, "Я тут, в этом чате 🤍 Пиши — отвечу.")
            except Exception:
                pass

        offset = 0
        while True:
            try:
                resp = await _api(client, token, "getUpdates", offset=offset, timeout=30)
                for upd in resp.get("result", []):
                    offset = upd["update_id"] + 1
                    msg = upd.get("message") or upd.get("edited_message")
                    if not msg:
                        continue
                    chat_id = str(msg.get("chat", {}).get("id"))
                    text = (msg.get("text") or "").strip()
                    if allowed and chat_id != allowed:
                        continue  # отвечаем только владельцу
                    if not text:
                        continue

                    try:
                        await _api(client, token, "sendChatAction", chat_id=chat_id, action="typing")
                    except Exception:
                        pass

                    s = get_settings()
                    async with lock:
                        convo.append({"role": "user", "content": text})
                        await publish({"type": "incoming", "role": "user", "content": text})   # реплика → в веб live
                        # Отвечаем одним готовым сообщением (без живого стрима): телеграм
                        # не даёт веб-плавности, а целостный ответ читается чище.
                        try:
                            result = await oai.complete(
                                convo,
                                instructions=get_instructions(),
                                model=s.get("model", "gpt-5.5"),
                                effort=s.get("reasoning", "low"),
                                search_fn=search.search if search.is_configured() else None,
                            )
                            reply = (result.get("text") or "").strip() or "…"
                        except Exception:
                            reply = "Ой, что-то пошло не так — попробуй ещё раз 🤍"
                        convo.append({"role": "assistant", "content": reply})
                        await publish({"type": "incoming", "role": "assistant", "content": reply})  # ответ → в веб live
                    await _send(client, token, chat_id, reply)
            except Exception:
                await asyncio.sleep(3)  # сетевой сбой/таймаут — подождём и продолжим
