import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeRoot = path.join(workspaceRoot, 'report-runtime');

async function runCli(args) {
  const { stdout } = await execFile('node', args, { cwd: workspaceRoot });
  return JSON.parse(stdout);
}

const closing = await runCli(['report-runtime/cli/run-report.mjs', '--reportType', 'closing', '--tradingDate', '2026-03-11', '--mode', 'scheduled', '--dryRun', 'true', '--publish', 'false', '--sourceMode', 'fixtures']);
const morning = await runCli(['report-runtime/cli/run-report.mjs', '--reportType', 'morning', '--tradingDate', '2026-03-11', '--mode', 'scheduled', '--dryRun', 'true', '--publish', 'false', '--sourceMode', 'files', '--briefFile', path.join(runtimeRoot, 'fixtures', 'morning-brief.sample.json')]);
const news = await runCli(['report-runtime/cli/run-report.mjs', '--reportType', 'news', '--slot', '2026-03-11-am', '--mode', 'scheduled', '--dryRun', 'true', '--publish', 'false', '--sourceMode', 'files', '--briefFile', path.join(runtimeRoot, 'fixtures', 'news-brief.sample.json')]);
const allDry = await runCli(['report-runtime/cli/run-all-dry.mjs', '--tradingDate', '2026-03-11', '--mode', 'scheduled']);

for (const result of [closing, morning, news]) {
  assert.equal(result.ok, true);
  assert.ok(typeof result.status === 'string' && result.status.length > 0);
  assert.ok(typeof result.markdownPath === 'string' && result.markdownPath.endsWith('.md'));
  assert.ok(typeof result.htmlPath === 'string' && result.htmlPath.endsWith('.html'));
  assert.ok('url' in result);
  assert.ok(typeof result.messageSummary === 'string' && result.messageSummary.length > 0);
}

assert.equal(Array.isArray(allDry), true);
assert.equal(allDry.length, 3);
assert.deepEqual(allDry.map((item) => item.reportType).sort(), ['closing', 'morning', 'news']);

console.log('cli-contract smoke ok');
