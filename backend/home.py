"""«Умный дом» Наоми. Пока датчики/кнопки фейковые — их задаёт Слава кликами в UI,
а Наоми видит состояние мгновенно. Храним в памяти + data/home.json (вне git).

build_context_note() собирает компактный блок «[Сейчас] …» (реальное время + снимок
дома), который эфемерно подкладывается в каждый запрос к модели (см. oai/ server).
"""
import json
import os
from datetime import datetime

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
HOME_FILE = os.path.join(DATA, "home.json")

# Старт-состояние (как в черновике). Имена людей — ключи (Слава = собеседник Наоми).
DEFAULT = {
    "people": {
        "Слава": {"home": True,  "room": "гостиная"},
        "Настя": {"home": False, "room": "гостиная"},
    },
    "ac":      {"on": True,  "temp": 23, "mode": "cool", "fan": "auto"},
    "toilet":  {"occupied": False},
    "weather": {"temp": 18, "wind": 5, "condition": "облачно"},
    "indoor":  {"спальня": 22, "гостиная": 23, "кухня": 24},
    "vacuum":  {"on": False, "mode": "vacuum"},
}

_state = None


def _deep_merge(base, over):
    out = dict(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def state() -> dict:
    """Текущее состояние дома (загружается с диска один раз, дальше — из памяти)."""
    global _state
    if _state is None:
        try:
            with open(HOME_FILE, "r", encoding="utf-8") as f:
                _state = _deep_merge(DEFAULT, json.load(f))
        except Exception:
            _state = _deep_merge(DEFAULT, {})
    return _state


def update(patch: dict) -> dict:
    """Патчим состояние (глубокий мердж) и сохраняем. Возвращаем новое состояние."""
    global _state
    _state = _deep_merge(state(), patch or {})
    try:
        os.makedirs(DATA, exist_ok=True)
        tmp = HOME_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_state, f, ensure_ascii=False, indent=2)
        os.replace(tmp, HOME_FILE)
    except Exception:
        pass
    return _state


# ---------------------------------------------------------------- блок контекста
_WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]
_MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
_AC_MODE = {"cool": "охлаждение", "heat": "обогрев", "fan": "вентиляция", "dry": "осушение", "auto": "авто"}
_FAN = {"auto": "авто", "low": "низкий", "mid": "средний", "high": "высокий"}
_VAC = {"vacuum": "пылесосит", "mop": "моет"}


def _now_str() -> str:
    now = datetime.now().astimezone()
    off = now.utcoffset()
    total = int(off.total_seconds()) if off else 0
    sign = "+" if total >= 0 else "-"
    offstr = f"UTC{sign}{abs(total) // 3600:02d}:{(abs(total) % 3600) // 60:02d}"
    tzn = now.tzname() or ""
    tz = f"{tzn} {offstr}" if tzn and tzn[0] not in "+-" else offstr
    return f"{_WD[now.weekday()]}, {now.day} {_MON[now.month - 1]} {now.year}, {now:%H:%M} ({tz})"


def build_context_note() -> str:
    """Компактный снимок «реально сейчас»: время + состояние дома. ~80–100 токенов."""
    s = state()
    # люди
    ppl = []
    for name, p in s.get("people", {}).items():
        ppl.append(f"{name} дома ({p.get('room', '?')})" if p.get("home") else f"{name} не дома")
    toilet = "в туалете кто-то есть" if s.get("toilet", {}).get("occupied") else "туалет свободен"
    # климат
    ac = s.get("ac", {})
    ac_str = (f"кондиционер вкл — {ac.get('temp')}°, {_AC_MODE.get(ac.get('mode'), ac.get('mode'))}, "
              f"вентилятор {_FAN.get(ac.get('fan'), ac.get('fan'))}") if ac.get("on") else "кондиционер выкл"
    indoor = ", ".join(f"{r} {t}°" for r, t in s.get("indoor", {}).items())
    w = s.get("weather", {})
    weather = f"за окном {w.get('temp')}°, {w.get('condition')}, ветер {w.get('wind')} м/с"
    vac = s.get("vacuum", {})
    vac_str = f"пылесос работает ({_VAC.get(vac.get('mode'), vac.get('mode'))})" if vac.get("on") else "пылесос спит"
    return (
        f"[Сейчас] {_now_str()}.\n"
        f"Дома: {', '.join(ppl)}. {toilet[:1].upper() + toilet[1:]}.\n"
        f"{ac_str[:1].upper() + ac_str[1:]}. В доме: {indoor}.\n"
        f"{weather[:1].upper() + weather[1:]}. {vac_str[:1].upper() + vac_str[1:]}."
    )
