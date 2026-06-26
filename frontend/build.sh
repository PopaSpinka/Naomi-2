#!/bin/sh
# Пересборка фронтенда: JSX → обычный JS (без браузерного Babel).
# Запускать вручную после правки app.jsx / ui-kit.jsx; результат (.js) — коммитить.
# npx тянет esbuild эфемерно, в РАНТАЙМЕ зависимости не появляются (этос «zero runtime deps» цел).
set -e
cd "$(dirname "$0")"
npx --yes esbuild@0.23.1 ui-kit.jsx app.jsx \
  --outdir=. --jsx=transform \
  --jsx-factory=React.createElement --jsx-fragment=React.Fragment \
  --log-level=info
echo "frontend rebuilt: ui-kit.js, app.js"
