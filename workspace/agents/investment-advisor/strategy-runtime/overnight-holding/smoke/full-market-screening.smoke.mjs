import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(runtimeRoot, '..', '..');
const tushareFixture = path.join(runtimeRoot, 'fixtures', 'live-selection-provider.tushare.sample.json');
const tempRoot = await mkdtemp(path.join(tmpdir(), 'overnight-full-market-screening-'));

async function runCli() {
  const { stdout } = await execFile('node', [
    'strategy-runtime/overnight-holding/cli/run-selection.mjs',
    '--tradingDate', '2026-03-12',
    '--variant', 'both',
    '--dryRun', 'false',
    '--workspaceRoot', tempRoot
  ], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      OPENCLAW_AGENT_FIXTURE_FILE: path.join(runtimeRoot, 'fixtures', 'selection.agent-decision.sample.json'),
      INVESTMENT_SELECTION_TUSHARE_FIXTURE_FILE: tushareFixture
    }
  });
  return JSON.parse(stdout);
}

try {
  const result = await runCli();
  assert.equal(result.ok, true);
  assert.equal(result.dataSourceMode, 'live-provider');
  assert.ok(typeof result.inputDataSource?.provider === 'string');
  assert.equal(result.prefilterSummary?.scope, 'full-market');
  assert.ok(result.prefilterSummary?.rawUniverseCount >= result.prefilterSummary?.technicalCandidatesCount);
  assert.ok(result.prefilterSummary?.tradableUniverseCount >= result.prefilterSummary?.technicalCandidatesCount);
  assert.ok(result.prefilterSummary?.technicalCandidatesCount <= 50);
  assert.ok(result.prefilterSummary?.filters?.includes('overnight-holding-technical'));

  const persistedSelection = JSON.parse(await readFile(result.dataPath, 'utf8'));
  assert.equal(persistedSelection.prefilterSummary?.scope, 'full-market');
  assert.ok(persistedSelection.prefilterSummary?.rawUniverseCount >= persistedSelection.prefilterSummary?.technicalCandidatesCount);
  assert.ok(
    persistedSelection.prefilterSummary?.tradableUniverseCount >= persistedSelection.prefilterSummary?.technicalCandidatesCount
  );
  assert.ok(persistedSelection.prefilterSummary?.technicalCandidatesCount <= 50);
  assert.ok(persistedSelection.prefilterSummary?.filters?.includes('overnight-holding-technical'));

  console.log('full-market-screening smoke ok');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
