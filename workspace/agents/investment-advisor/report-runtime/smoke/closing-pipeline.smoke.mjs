import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJsonFile } from '../lib/io.mjs';
import { runClosingReport } from '../reports/closing/run.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempRoot = await mkdtemp(path.join(tmpdir(), 'closing-pipeline-smoke-'));

try {
  const result = await runClosingReport({
    workspaceRoot: tempRoot,
    templateWorkspaceRoot: workspaceRoot,
    tradingDate: '2026-03-11',
    mode: 'manual',
    dryRun: true,
    publish: false,
    sourceMode: 'fixtures'
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');

  const data = await readJsonFile(result.dataPath);
  const publishResult = await readJsonFile(result.publishResultPath);
  const markdown = await readFile(result.markdownPath, 'utf8');
  const html = await readFile(result.htmlPath, 'utf8');

  assert.equal(data.reportType, 'closing');
  assert.equal(data.tradingDate, '2026-03-11');
  assert.ok(Array.isArray(data.summaryCards) && data.summaryCards.length >= 3);
  assert.ok(Array.isArray(data.technicalCharts) && data.technicalCharts.length >= 3);
  assert.ok(markdown.includes('# A股收盘报告'));
  assert.ok(markdown.includes('## 一句话结论'));
  assert.ok(html.includes(data.conclusion.text));
  assert.ok(!html.includes('__REPORT_DATA__'));
  assert.ok(html.includes("const color = c.close >= c.open ? '#d94f3d' : '#12966b';"));
  assert.ok(html.includes("const color = candle.close >= candle.open ? 'rgba(217,79,61,0.68)' : 'rgba(18,150,107,0.68)';"));
  assert.ok(html.includes("fill: v >= 0 ? 'rgba(217,79,61,0.75)' : 'rgba(18,150,107,0.75)'"));
  assert.equal(publishResult.status, 'ready');
  assert.equal(publishResult.publish, false);

  const liveOverrideResult = await runClosingReport({
    workspaceRoot: tempRoot,
    templateWorkspaceRoot: workspaceRoot,
    tradingDate: '2026-03-11',
    mode: 'scheduled',
    dryRun: true,
    publish: false,
    sourceMode: 'live',
    quotesFile: path.join(workspaceRoot, 'report-runtime', 'fixtures', 'tencent-quotes.sample.json'),
    sectorsFile: path.join(workspaceRoot, 'report-runtime', 'fixtures', 'eastmoney-sectors.sample.json'),
    klineFile: path.join(workspaceRoot, 'report-runtime', 'fixtures', 'eastmoney-kline.sample.json'),
    newsFile: path.join(workspaceRoot, 'report-runtime', 'fixtures', 'news-feed.sample.html')
  });

  const liveOverrideData = await readJsonFile(liveOverrideResult.dataPath);
  assert.equal(liveOverrideResult.ok, true);
  assert.equal(liveOverrideData.tradingDate, '2026-03-11');
  assert.ok(Array.isArray(liveOverrideData.summaryCards) && liveOverrideData.summaryCards.length >= 3);

  console.log('closing-pipeline smoke ok');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
