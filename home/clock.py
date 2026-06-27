"""Время для блока «[Сейчас] …». Это не «прибор» дома, а отдельный контекст —
поэтому живёт рядом с оркестратором, а не среди modules/."""
from datetime import datetime

_WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]
_MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]


def now_str() -> str:
    """Локальные дата/время с поясом: «сб, 27 июн 2026, 10:06 (EDT UTC-04:00)»."""
    now = datetime.now().astimezone()
    off = now.utcoffset()
    total = int(off.total_seconds()) if off else 0
    sign = "+" if total >= 0 else "-"
    offstr = f"UTC{sign}{abs(total) // 3600:02d}:{(abs(total) % 3600) // 60:02d}"
    tzn = now.tzname() or ""
    tz = f"{tzn} {offstr}" if tzn and tzn[0] not in "+-" else offstr
    return f"{_WD[now.weekday()]}, {now.day} {_MON[now.month - 1]} {now.year}, {now:%H:%M} ({tz})"
