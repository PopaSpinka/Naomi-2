"""Погода за окном. Пока фейк — задаётся кликами в панели (позже — реальный источник)."""
KEY = "weather"
LABEL = "За окном"
DEFAULT = {"temp": 18, "wind": 5, "condition": "облачно"}


def context(s):
    s = s or {}
    return f"за окном {s.get('temp')}°, {s.get('condition')}, ветер {s.get('wind')} м/с"
