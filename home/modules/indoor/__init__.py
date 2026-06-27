"""Температура в доме по комнатам. Пока фейк — задаётся кликами в панели."""
KEY = "indoor"
LABEL = "Температура в доме"
DEFAULT = {"спальня": 22, "гостиная": 23, "кухня": 24}


def context(s):
    s = s or {}
    if not s:
        return None
    return "в доме: " + ", ".join(f"{room} {t}°" for room, t in s.items())
