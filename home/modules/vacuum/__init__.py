"""Робот-пылесос. Пока фейк (статус/режим кликами). Позже сюда же — реальное
управление: свой requirements.txt, config.json (вне git), tools() для команд."""
KEY = "vacuum"
LABEL = "Робот-пылесос"
DEFAULT = {"on": False, "mode": "vacuum"}

_MODE = {"vacuum": "пылесосит", "mop": "моет"}


def context(s):
    s = s or {}
    return f"пылесос работает ({_MODE.get(s.get('mode'), s.get('mode'))})" if s.get("on") else "пылесос спит"
