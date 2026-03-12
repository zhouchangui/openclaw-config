import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveReportArtifacts, resolveTemplateDir, resolveWorkspacePaths } from '../lib/paths.mjs';
import { readJsonFile, writeJsonFile, writeTextFile } from '../lib/io.mjs';
import { validateSharedReport } from '../lib/schema-checks.mjs';
import { renderHtmlReport } from '../lib/render-html.mjs';
import { buildPublishResult, writePublishResult } from '../lib/publish-result.mjs';
import { buildSummaryMessage } from '../lib/summary-message.mjs';

const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(runtimeRoot, '../..');

const templateSeed = await readJsonFile(
  path.join(workspaceRoot, 'report-templates', 'closing-market-report', 'sample-report-data.json')
);

const reportData = {
  ...templateSeed,
  reportId: 'closing-2026-03-11',
  reportType: 'closing',
  title: templateSeed.meta.heading,
  tradingDate: '2026-03-11',
  generatedAt: '2026-03-11T15:05:00+08:00',
  timezone: 'Asia/Shanghai',
  marketScope: 'A-share+global',
  status: 'ready',
  fallbackLevel: 'none',
  sources: [
    {
      name: 'fixtures',
      status: 'ok',
      timestamp: '2026-03-11T15:05:00+08:00'
    }
  ]
};

const tempRoot = await mkdtemp(path.join(tmpdir(), 'report-runtime-foundation-'));

try {
  const paths = resolveWorkspacePaths(tempRoot);
  assert.equal(paths.dataDir, path.join(tempRoot, 'data'));
  assert.equal(paths.reportsDir, path.join(tempRoot, 'reports'));
  assert.equal(paths.reportRuntimeDir, path.join(tempRoot, 'report-runtime'));

  const artifacts = resolveReportArtifacts({
    workspaceRoot: tempRoot,
    reportType: 'closing',
    tradingDate: '2026-03-11'
  });

  assert.equal(artifacts.key, '2026-03-11');
  assert.equal(
    artifacts.publishResultPath,
    path.join(tempRoot, 'reports', 'closing', '2026-03-11.publish-result.json')
  );

  const schemaResult = validateSharedReport(reportData);
  assert.equal(schemaResult.ok, true, schemaResult.issues.join('; '));

  await writeJsonFile(artifacts.dataPath, reportData);
  await writeTextFile(artifacts.markdownPath, '# smoke markdown\n');

  await renderHtmlReport({
    templateDir: resolveTemplateDir({ workspaceRoot, reportType: 'closing' }),
    reportData,
    outputPath: artifacts.htmlPath
  });

  const publishResult = buildPublishResult({
    reportType: 'closing',
    key: artifacts.key,
    status: 'ready',
    publish: false,
    dryRun: true,
    url: 'https://example.com/reports/closing/2026-03-11.html',
    path: 'reports/closing/2026-03-11.html',
    markdownPath: artifacts.markdownPath,
    htmlPath: artifacts.htmlPath,
    dataPath: artifacts.dataPath,
    messageSummary: buildSummaryMessage(reportData, {
      url: 'https://example.com/reports/closing/2026-03-11.html'
    })
  });

  await writePublishResult(artifacts.publishResultPath, publishResult);

  const html = await readFile(artifacts.htmlPath, 'utf8');
  const publishFile = await readJsonFile(artifacts.publishResultPath);

  assert.ok(html.includes(reportData.summary));
  assert.ok(html.includes(reportData.conclusion.text));
  assert.ok(html.includes('<style>'));
  assert.ok(!html.includes('__REPORT_DATA__'));
  assert.equal(publishFile.reportType, 'closing');
  assert.equal(publishFile.path, 'reports/closing/2026-03-11.html');
  assert.ok(
    publishFile.messageSummary.includes('https://example.com/reports/closing/2026-03-11.html')
  );

  console.log(`runtime-foundation smoke ok: ${tempRoot}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
