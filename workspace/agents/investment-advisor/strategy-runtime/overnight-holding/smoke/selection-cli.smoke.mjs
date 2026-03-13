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
const tempRoot = await mkdtemp(path.join(tmpdir(), 'overnight-selection-'));

async function runCli(args) {
  const { stdout } = await execFile('node', args, { cwd: workspaceRoot });
  return JSON.parse(stdout);
}

try {
  const result = await runCli([
    'strategy-runtime/overnight-holding/cli/run-selection.mjs',
    '--tradingDate', '2026-03-12',
    '--variant', 'both',
    '--dryRun', 'true',
    '--workspaceRoot', tempRoot,
    '--marketFile', path.join(runtimeRoot, 'fixtures', 'market-regime.good.json'),
    '--candidatesFile', path.join(runtimeRoot, 'fixtures', 'candidates.sample.json')
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.phase, 'selection');
  assert.equal(result.marketGate.tradable, true);
  assert.equal(result.selectedCandidates.leader[0].symbol, '300750');
  assert.equal(result.selectedCandidates.midcore[0].symbol, '600519');
  assert.equal(result.virtualBuys.length, 2);
  assert.ok(result.messageSummary.includes('隔日持股'));
  assert.ok(result.dataPath.endsWith('.selection.json'));
  assert.ok(result.markdownPath.endsWith('.selection.md'));

  const selectionPackage = JSON.parse(await readFile(result.dataPath, 'utf8'));
  assert.equal(selectionPackage.virtualBuys.length, 2);

  const markdown = await readFile(result.markdownPath, 'utf8');
  assert.match(markdown, /2026-03-12/);
  assert.match(markdown, /龙头候选/);

  const state = JSON.parse(
    await readFile(path.join(tempRoot, 'data', 'overnight-holding', 'state.json'), 'utf8')
  );
  assert.equal(state.currentPositions.length, 2);
  assert.equal(state.selectionJournal.length, 1);

  console.log('selection-cli smoke ok');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
