"""Туалет: занят/свободен. Пока фейк — задаётся кликами в панели."""
KEY = "toilet"
LABEL = "Туалет"
DEFAULT = {"occupied": False}


def context(s):
    return "в туалете кто-то есть" if (s or {}).get("occupied") else "туалет свободен"
