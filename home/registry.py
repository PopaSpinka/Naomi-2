"""Какие модули дома включены и в каком порядке идут в блок «[Сейчас] …».
Добавил новый модуль (реальный пылесос, ТВ, солнечная станция) — импортируй сюда."""
from .modules import presence, toilet, climate, indoor, weather, vacuum

MODULES = [presence, toilet, climate, indoor, weather, vacuum]
