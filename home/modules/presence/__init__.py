"""Присутствие: кто дома и в какой комнате. Пока фейк — Слава задаёт кликами в панели.

Контракт модуля дома (его держат все modules/*):
  KEY      — ключ среза состояния (его же шлёт/ждёт фронт и /api/home)
  LABEL    — человекочитаемое имя
  DEFAULT  — стартовое состояние среза
  context(s) -> str | None   — вклад в блок «[Сейчас] …» (s = текущий срез)
  persona() -> str | None    — как Наоми про это говорит (опц.)
  # позже у реальных: tools(), async start(), live_state()
"""
KEY = "people"
LABEL = "Люди"
DEFAULT = {
    "Слава": {"home": True,  "room": "гостиная"},
    "Настя": {"home": False, "room": "гостиная"},
}


def context(s):
    parts = []
    for name, p in (s or {}).items():
        if not isinstance(p, dict):   # патч мог прислать не-словарь — не падаем
            continue
        parts.append(f"{name} дома ({p.get('room', '?')})" if p.get("home") else f"{name} не дома")
    return ", ".join(parts) if parts else None
