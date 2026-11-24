#!/bin/bash
# Архивы для передачи: исходники (без node_modules/dist/артефактов) и готовая сборка dist/.
set -e
cd "$(dirname "$0")/.."
rm -f /tmp/salimeter-src.zip /tmp/salimeter-dist.zip
zip -qr /tmp/salimeter-src.zip . -x 'node_modules/*' 'dist/*' 'coverage/*' 'test-results/*' 'playwright-report/*' '.shots/*' '*.map'
(cd dist && zip -qr /tmp/salimeter-dist.zip .)
ls -la /tmp/salimeter-src.zip /tmp/salimeter-dist.zip
