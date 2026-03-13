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

async function runCli(tempRoot, extraEnv) {
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
      ...extraEnv
    }
  });
  return JSON.parse(stdout);
}

const tushareFixture = path.join(runtimeRoot, 'fixtures', 'live-selection-provider.tushare.sample.json');
const akshareFixture = path.join(runtimeRoot, 'fixtures', 'live-selection-provider.akshare.sample.json');
const emptyTushareFixture = path.join(runtimeRoot, 'fixtures', 'live-selection-provider.empty.sample.json');

const tushareRoot = await mkdtemp(path.join(tmpdir(), 'overnight-live-provider-tushare-'));
const fallbackRoot = await mkdtemp(path.join(tmpdir(), 'overnight-live-provider-fallback-'));

try {
  const tushareResult = await runCli(tushareRoot, {
    INVESTMENT_SELECTION_TUSHARE_FIXTURE_FILE: tushareFixture
  });
  assert.equal(tushareResult.ok, true);
  assert.equal(tushareResult.dataSourceMode, 'live-provider');
  assert.equal(tushareResult.inputDataSource.provider, 'tushare');
  assert.equal(tushareResult.virtualBuys.length, 2);

  const tushareAudit = JSON.parse(
    await readFile(path.join(tushareRoot, 'data', 'overnight-holding', 'audit', '2026-03-12.json'), 'utf8')
  );
  assert.equal(tushareAudit.dataLineage.at(-1).inputProvider, 'tushare');
  assert.equal(
    tushareAudit.exceptionsAndFallbacks.some((item) => item.type === 'selection_input_provider_fallback'),
    false
  );

  const fallbackResult = await runCli(fallbackRoot, {
    INVESTMENT_SELECTION_TUSHARE_FIXTURE_FILE: emptyTushareFixture,
    INVESTMENT_SELECTION_AKSHARE_FIXTURE_FILE: akshareFixture
  });
  assert.equal(fallbackResult.ok, true);
  assert.equal(fallbackResult.dataSourceMode, 'live-provider');
  assert.equal(fallbackResult.inputDataSource.provider, 'akshare');
  assert.equal(fallbackResult.inputDataSource.fallbackFrom, 'tushare');

  const fallbackAudit = JSON.parse(
    await readFile(path.join(fallbackRoot, 'data', 'overnight-holding', 'audit', '2026-03-12.json'), 'utf8')
  );
  assert.equal(fallbackAudit.dataLineage.at(-1).inputProvider, 'akshare');
  assert.equal(
    fallbackAudit.exceptionsAndFallbacks.at(-1).type,
    'selection_input_provider_fallback'
  );

  console.log('selection-live-provider smoke ok');
} finally {
  await rm(tushareRoot, { recursive: true, force: true });
  await rm(fallbackRoot, { recursive: true, force: true });
}
