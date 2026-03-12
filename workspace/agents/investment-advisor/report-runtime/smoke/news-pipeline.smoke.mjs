import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJsonFile } from '../lib/io.mjs';
import { runNewsReport } from '../reports/news/run.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempRoot = await mkdtemp(path.join(tmpdir(), 'news-pipeline-smoke-'));

try {
  const result = await runNewsReport({
    workspaceRoot: tempRoot,
    templateWorkspaceRoot: workspaceRoot,
    slot: '2026-03-11-am',
    mode: 'manual',
    dryRun: true,
    publish: false,
    sourceMode: 'fixtures'
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');

  const data = await readJsonFile(result.dataPath);
  const markdown = await readFile(result.markdownPath, 'utf8');
  const html = await readFile(result.htmlPath, 'utf8');

  assert.equal(data.reportType, 'news');
  assert.ok(Array.isArray(data.topNews) && data.topNews.length >= 3);
  assert.ok(Array.isArray(data.impactMatrix) && data.impactMatrix.length >= 3);
  assert.ok(markdown.includes('# 消息面报告'));
  assert.ok(markdown.includes('## 最重要的三条消息'));
  assert.ok(markdown.includes('## 影响路径'));
  assert.ok(markdown.includes('## 精简时间线'));
  assert.ok(!markdown.includes('## CCTV 新闻摘要'));
  assert.ok(!markdown.includes('## 噪音过滤'));
  assert.ok(!markdown.includes('## 关键消息明细'));
  assert.ok(html.includes(data.conclusion.text));
  assert.ok(html.includes('最重要的三条消息'));
  assert.ok(html.includes('影响路径'));
  assert.ok(html.includes('精简时间线'));
  assert.ok(!html.includes('CCTV 新闻摘要'));
  assert.ok(!html.includes('id="noise-grid"'));
  assert.ok(!html.includes('<h2>关键消息明细</h2>'));

  const liveStyleResult = await runNewsReport({
    workspaceRoot: tempRoot,
    templateWorkspaceRoot: workspaceRoot,
    slot: '2026-03-12-am',
    mode: 'scheduled',
    dryRun: true,
    publish: false,
    sourceMode: 'live',
    briefFile: path.join(workspaceRoot, 'report-runtime', 'fixtures', 'news-brief.akshare.sample.json')
  });

  const liveStyleData = await readJsonFile(liveStyleResult.dataPath);
  const liveStyleHtml = await readFile(liveStyleResult.htmlPath, 'utf8');

  assert.equal(liveStyleResult.ok, true);
  assert.ok(Array.isArray(liveStyleData.timelineEvents) && liveStyleData.timelineEvents.length >= 3);
  assert.ok(liveStyleHtml.includes('精简时间线'));
  assert.ok(!liveStyleHtml.includes('<h2>CCTV 新闻摘要</h2>'));
  assert.ok(!liveStyleHtml.includes('id="cctv-grid"'));

  console.log('news-pipeline smoke ok');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
