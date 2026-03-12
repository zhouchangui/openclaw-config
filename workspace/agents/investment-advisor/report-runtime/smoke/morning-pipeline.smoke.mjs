import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJsonFile } from '../lib/io.mjs';
import { runMorningReport } from '../reports/morning/run.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempRoot = await mkdtemp(path.join(tmpdir(), 'morning-pipeline-smoke-'));

try {
  const result = await runMorningReport({
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
  const markdown = await readFile(result.markdownPath, 'utf8');
  const html = await readFile(result.htmlPath, 'utf8');

  assert.equal(data.reportType, 'morning');
  assert.ok(Array.isArray(data.focusAreas) && data.focusAreas.length >= 3);
  assert.ok(Array.isArray(data.policySignals) && data.policySignals.length >= 3);
  assert.ok(markdown.includes('# A股早盘报告'));
  assert.ok(markdown.includes('## 今日主线预判'));
  assert.ok(html.includes(data.conclusion.text));
  assert.ok(html.includes('外围与盘前看板'));

  console.log('morning-pipeline smoke ok');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
