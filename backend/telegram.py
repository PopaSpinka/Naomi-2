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


# Живой стрим: правим одно сообщение по мере генерации (эффект «печати»).
# У Телеграма нет токен-стрима — это делается частыми editMessageText. Правки
# лимитированы (безопасно ~1/сек на сообщение, обе edit-операции в одном ведре),
# поэтому флашим не чаще EDIT_INTERVAL и уважаем retry_after при 429.
EDIT_INTERVAL = 1.1
SEARCH_HINT = "ищу в интернете…"


async def _stream_reply(client, token, chat_id, convo, *, instructions, model, effort, search_fn):
    """Прогрессивно дописывает один ответ Наоми в чат. Возвращает финальный текст,
    либо None — если стрим не удалось даже начать (вызывающий сделает обычный ответ)."""
    loop = asyncio.get_running_loop()
    init = await _api(client, token, "sendMessage", chat_id=chat_id, text="…")
    if not init.get("ok"):
        return None
    mid = init["result"]["message_id"]

    acc = ""              # накопленный текст ответа
    shown = "…"           # что сейчас отрисовано в сообщении
    searching = False     # идёт веб-поиск → показываем статус вместо текста
    last_edit = loop.time() - EDIT_INTERVAL   # чтобы первый кусок показать сразу

    async def flush(force=False):
        nonlocal last_edit, shown
        if searching:
            text = (acc + "\n\n" + SEARCH_HINT) if acc else SEARCH_HINT
        else:
            text = acc
        text = (text.strip()[:MSG_LIMIT]) or "…"
        if text == shown:
            return
        if not force and (loop.time() - last_edit) < EDIT_INTERVAL:
            return
        r = await _api(client, token, "editMessageText", chat_id=chat_id, message_id=mid, text=text)
        if not r.get("ok"):
            ra = (r.get("parameters") or {}).get("retry_after")
            if ra:
                await asyncio.sleep(min(ra, 10) + 0.3)   # флуд-вейт — подождём и попробуем позже
            return
        shown, last_edit = text, loop.time()

    try:
        async for kind, part in oai.stream_chat(convo, instructions=instructions, model=model,
                                                effort=effort, search_fn=search_fn):
            if kind == "tool":
                searching = True
                await flush(force=True)          # сразу покажем «ищу…»
            elif kind == "delta" and part:
                searching = False                # пошёл ответ — гасим статус
                acc += part
                await flush()
            elif kind == "error":
                break
    except Exception:
        pass

    acc = acc.strip()
    if not acc:
        err = "Ой, что-то пошло не так — попробуй ещё раз 🤍"
        await _api(client, token, "editMessageText", chat_id=chat_id, message_id=mid, text=err)
        return err

    # финал: гарантированно дорисуем полный текст (с учётом лимита 4096)
    chunks = [acc[i:i + MSG_LIMIT] for i in range(0, len(acc), MSG_LIMIT)]
    if chunks[0] != shown:
        await _api(client, token, "editMessageText", chat_id=chat_id, message_id=mid, text=chunks[0])
    for extra in chunks[1:]:
        await _api(client, token, "sendMessage", chat_id=chat_id, text=extra)
    return acc


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
                    sfn = search.search if search.is_configured() else None
                    async with lock:
                        convo.append({"role": "user", "content": text})
                        await publish({"type": "incoming", "role": "user", "content": text})   # реплика → в веб live
                        try:
                            reply = await _stream_reply(
                                client, token, chat_id, convo,
                                instructions=get_instructions(),
                                model=s.get("model", "gpt-5.5"),
                                effort=s.get("reasoning", "low"),
                                search_fn=sfn,
                            )
                        except Exception:
                            reply = None
                        if reply is None:
                            # стрим не стартовал — обычный полный ответ, чтобы не молчать
                            try:
                                result = await oai.complete(
                                    convo, instructions=get_instructions(),
                                    model=s.get("model", "gpt-5.5"), effort=s.get("reasoning", "low"),
                                    search_fn=sfn,
                                )
                                reply = (result.get("text") or "").strip() or "…"
                            except Exception:
                                reply = "Ой, что-то пошло не так — попробуй ещё раз 🤍"
                            await _send(client, token, chat_id, reply)
                        convo.append({"role": "assistant", "content": reply})
                        await publish({"type": "incoming", "role": "assistant", "content": reply})  # ответ → в веб live
            except Exception:
                await asyncio.sleep(3)  # сетевой сбой/таймаут — подождём и продолжим
