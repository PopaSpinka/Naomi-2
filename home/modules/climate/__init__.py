"""Кондиционер. Пока фейк — управляется кликами в панели."""
KEY = "ac"
LABEL = "Кондиционер"
DEFAULT = {"on": True, "temp": 23, "mode": "cool", "fan": "auto"}

_MODE = {"cool": "охлаждение", "heat": "обогрев", "fan": "вентиляция", "dry": "осушение", "auto": "авто"}
_FAN = {"auto": "авто", "low": "низкий", "mid": "средний", "high": "высокий"}


def context(s):
    s = s or {}
    if not s.get("on"):
        return "кондиционер выкл"
    return (f"кондиционер вкл — {s.get('temp')}°, {_MODE.get(s.get('mode'), s.get('mode'))}, "
            f"вентилятор {_FAN.get(s.get('fan'), s.get('fan'))}")
