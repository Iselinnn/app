#!/bin/bash
# Lighthouse: 3 прогона производительности после паузы (чтобы не мерить под нагрузкой от тестов), затем soak-тест памяти 5 минут.
cd /data/agent/workspaces/agt_oxnuacdgwai2/salimeter
sleep 90
for i in 1 2 3; do
  CHROME_PATH=/opt/browser/chrome NODE_ENV=development npx lighthouse http://127.0.0.1:4173/ --output=json --output=html --output-path=/tmp/lhf-$i --chrome-flags="--headless=new --no-sandbox --disable-gpu" --only-categories=performance --quiet >/dev/null 2>&1
  sleep 20
done
python3 - <<'PY'
import json
for i in (1,2,3):
    d=json.load(open(f'/tmp/lhf-{i}.report.json')); a=d['audits']
    print(f'perf run {i}:', round(d['categories']['performance']['score']*100), 'bench', d['environment']['benchmarkIndex'], 'FCP', a['first-contentful-paint']['displayValue'], 'LCP', a['largest-contentful-paint']['displayValue'], 'TBT', a['total-blocking-time']['displayValue'], 'CLS', a['cumulative-layout-shift']['displayValue'], 'SI', a['speed-index']['displayValue'])
PY
echo "--- soak 300s"
SALIMETER_SOAK_SECONDS=300 NODE_ENV=development npx playwright test --project=pixel7 -g "память" 2>&1 | grep -E "heap |passed|failed|✓|✘"
echo "BATCH DONE"
