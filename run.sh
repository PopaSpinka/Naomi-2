#!/bin/sh
# Запуск Наоми (mac/linux). Открой потом http://127.0.0.1:8765
set -e
cd "$(dirname "$0")/backend"
[ -d .venv ] || python3 -m venv .venv
./.venv/bin/pip install -q -r requirements.txt
exec ./.venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8765
