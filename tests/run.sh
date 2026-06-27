#!/bin/sh
# Тесты Наоми (stdlib unittest, без лишних зависимостей).
# Состояние умного дома в тестах изолировано — реальный home/data/state.json не трогается.
cd "$(dirname "$0")/.."
exec backend/.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
