#!/bin/sh
# Пересборка фронтенда: JSX → обычный JS (без браузерного Babel).
# Запускать вручную после правки app.jsx / ui-kit.jsx; результат (.js, index.html) — коммитить.
# npx тянет esbuild эфемерно, в РАНТАЙМЕ зависимости не появляются (этос «zero runtime deps» цел).
set -e
cd "$(dirname "$0")"
npx --yes esbuild@0.23.1 ui-kit.jsx app.jsx \
  --outdir=. --jsx=transform \
  --jsx-factory=React.createElement --jsx-fragment=React.Fragment \
  --log-level=info

# Версионируем подключение скриптов (?v=хэш) — чтобы браузер не отдавал старый кеш после правок UI.
VER=$(cat ui-kit.js app.js | shasum | cut -c1-8)
sed -i.bak -E "s#(src=\"(app|ui-kit)\.js)(\?v=[a-f0-9]+)?\"#\1?v=${VER}\"#g" index.html && rm -f index.html.bak
echo "frontend rebuilt: ui-kit.js, app.js (v=${VER})"
