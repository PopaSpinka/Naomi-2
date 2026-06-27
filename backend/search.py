"""Поиск в интернете для Наоми через Tavily.

Ключ хранится в data/services.json (в .gitignore). Наоми вызывает это как инструмент
web_search; запрос модель формулирует на английском (см. описание инструмента в oai.py).
Бесплатный тариф ~1000 запросов/мес → search_depth="basic" (1 кредит), ищем только когда модель сама решит.
"""
import json
import os

import httpx

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
SERVICES_FILE = os.path.join(DATA, "services.json")
API_URL = "https://api.tavily.com/search"
MAX_RESULTS = 5


def _load() -> dict:
    try:
        with open(SERVICES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def load_key() -> str:
    return (_load().get("tavily_api_key") or "").strip()


def save_key(key: str) -> None:
    os.makedirs(DATA, exist_ok=True)
    cfg = _load()
    cfg["tavily_api_key"] = (key or "").strip()
    tmp = SERVICES_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, SERVICES_FILE)
    try:
        os.chmod(SERVICES_FILE, 0o600)
    except Exception:
        pass


def is_configured() -> bool:
    return bool(load_key())


def status() -> dict:
    """Статус для UI: подключён ли Tavily (без выдачи самого ключа)."""
    k = load_key()
    return {"configured": bool(k), "key_hint": (k[:8] + "…" + k[-4:]) if k else ""}


def _format(data: dict) -> str:
    """Компактный результат для модели: синтез-ответ + топ источников (заголовок/url/выжимка)."""
    out = {"answer": (data.get("answer") or "")}
    res = []
    for r in (data.get("results") or [])[:MAX_RESULTS]:
        res.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": (r.get("content") or "")[:500],
        })
    out["results"] = res
    return json.dumps(out, ensure_ascii=False)


async def search(query: str, max_results: int = MAX_RESULTS) -> str:
    """Ищет в Tavily и возвращает строку-результат для инструмента web_search."""
    key = load_key()
    if not key:
        return json.dumps({"error": "Tavily не подключён (нет ключа в Аккаунте)."}, ensure_ascii=False)
    if not (query or "").strip():
        return json.dumps({"error": "Пустой поисковый запрос."}, ensure_ascii=False)
    body = {
        "query": query,
        "search_depth": "basic",       # 1 кредит на бесплатном тарифе (auto_parameters НЕ трогаем)
        "topic": "general",
        "max_results": max_results,
        "include_answer": "advanced",  # богатый синтез-ответ, цена та же
    }
    headers = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10, read=25, write=10, pool=10)) as c:
            r = await c.post(API_URL, json=body, headers=headers)
            if r.status_code == 401:
                return json.dumps({"error": "Tavily: ключ не принят (401). Проверь ключ в Аккаунте."}, ensure_ascii=False)
            if r.status_code == 429:
                return json.dumps({"error": "Tavily: исчерпан лимит запросов (429)."}, ensure_ascii=False)
            r.raise_for_status()
            return _format(r.json())
    except Exception as e:
        return json.dumps({"error": f"Поиск не удался: {type(e).__name__}"}, ensure_ascii=False)
