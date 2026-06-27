"""Учёт токенов за сессию. В памяти процесса → сбрасывается при перезапуске (как и тред).

usage приходит из responses-API (oai): input_tokens, output_tokens, total_tokens и
input_tokens_details.cached_tokens. record() копит суммы, snapshot() отдаёт их в UI.
"""
_s = {
    "last_input": 0,     # сколько ушло в ПОСЛЕДНЕМ запросе (то, что отправляется каждый раз)
    "last_cached": 0,    # из них из кеша
    "total_input": 0,
    "total_output": 0,
    "total_cached": 0,
    "requests": 0,
}


def reset() -> None:
    """Обнулить счётчики — зовётся при очистке чата (мусорка = новая сессия)."""
    for k in _s:
        _s[k] = 0


def record(usage: dict) -> None:
    if not usage:
        return
    inp = int(usage.get("input_tokens") or 0)
    out = int(usage.get("output_tokens") or 0)
    cached = int((usage.get("input_tokens_details") or {}).get("cached_tokens") or 0)
    _s["last_input"] = inp
    _s["last_cached"] = cached
    _s["total_input"] += inp
    _s["total_output"] += out
    _s["total_cached"] += cached
    _s["requests"] += 1


def snapshot() -> dict:
    ti = _s["total_input"]
    return {
        "last_input": _s["last_input"],                 # размер текущего запроса (токенов)
        "last_cached": _s["last_cached"],
        "total": _s["total_input"] + _s["total_output"],  # всего токенов за сессию
        "total_input": _s["total_input"],
        "total_output": _s["total_output"],
        "cached": _s["total_cached"],                   # сколько кешировано (суммарно)
        "cached_pct": round(_s["total_cached"] / ti * 100, 1) if ti else 0.0,  # процент кеша от входных
        "requests": _s["requests"],
    }
