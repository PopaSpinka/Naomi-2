"""Оркестратор «умного дома». Собирает состояние/контекст/персону со всех модулей
(см. registry.py) и маршрутизирует изменения. Внешний API (зовут server.py / telegram.py):

  state()              — общее состояние для панели        → GET /api/home
  update(patch)        — применить изменение (клик в панели)→ POST /api/home
  build_context_note() — блок «[Сейчас] …» (время + дом) в каждый запрос к модели
  persona()            — кусок инструкций про дом (добавляется к личности Наоми)

Состояние фейковых модулей хранится одним файлом home/data/state.json (вне git).
Реальные модули позже смогут отдавать своё живое состояние сами (live_state).
"""
import json
import os

from . import clock, registry

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(HERE, "data")
STATE_FILE = os.path.join(DATA, "state.json")
LEGACY_FILE = os.path.join(ROOT, "backend", "data", "home.json")   # перенос со старого места
PERSONA_MD = os.path.join(HERE, "persona.md")

_state = None


def _deep_merge(base, over):
    out = dict(base)
    for k, v in (over or {}).items():
        out[k] = _deep_merge(out[k], v) if (isinstance(v, dict) and isinstance(out.get(k), dict)) else v
    return out


def _read(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _defaults():
    return {m.KEY: json.loads(json.dumps(m.DEFAULT)) for m in registry.MODULES}


def state() -> dict:
    global _state
    if _state is None:
        saved = _read(STATE_FILE)
        if saved is None:
            saved = _read(LEGACY_FILE)   # одноразовый перенос состояния с backend/data/home.json
        _state = _deep_merge(_defaults(), saved or {})
    return _state


def update(patch: dict) -> dict:
    global _state
    _state = _deep_merge(state(), patch or {})
    try:
        os.makedirs(DATA, exist_ok=True)
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_state, f, ensure_ascii=False, indent=2)
        os.replace(tmp, STATE_FILE)
    except Exception:
        pass
    return _state


def build_context_note() -> str:
    """«[Сейчас] {время}.» + по предложению от каждого модуля."""
    st = state()
    facts = []
    for m in registry.MODULES:
        c = m.context(st.get(m.KEY))
        if c:
            facts.append(c[0].upper() + c[1:])
    head = f"[Сейчас] {clock.now_str()}."
    return f"{head}\n{'. '.join(facts)}." if facts else head


def persona() -> str:
    """home/persona.md + персональные куски модулей → добавляется к инструкциям Наоми."""
    parts = []
    try:
        with open(PERSONA_MD, "r", encoding="utf-8") as f:
            t = f.read().strip()
            if t:
                parts.append(t)
    except Exception:
        pass
    for m in registry.MODULES:
        fn = getattr(m, "persona", None)
        p = fn() if fn else None
        if p:
            parts.append(p.strip())
    return "\n\n".join(parts)
