import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(runtimeRoot, '..', '..');
const tempRoot = await mkdtemp(path.join(tmpdir(), 'overnight-selection-'));
const technicalCandidates = {
  sectorContinuityScore: 82,
  candidates: [
    {
      symbol: '300750',
      name: '龙头候选',
      boardLeadership: 92,
      themeResonance: 90,
      liquidityStability: 66,
      trendIntegrity: 72,
      afternoonSupport: 78,
      nextDayRealizability: 68
    },
    {
      symbol: '600519',
      name: '中军候选',
      boardLeadership: 60,
      themeResonance: 74,
      liquidityStability: 91,
      trendIntegrity: 88,
      afternoonSupport: 80,
      nextDayRealizability: 87
    },
    {
      symbol: '000858',
      name: '技术候选',
      boardLeadership: 70,
      themeResonance: 70,
      liquidityStability: 95,
      trendIntegrity: 95,
      afternoonSupport: 90,
      nextDayRealizability: 90
    }
  ]
};

async function runCli(args) {
  const { stdout } = await execFile('node', args, { cwd: workspaceRoot });
  return JSON.parse(stdout);
}

try {
  const candidatesFile = path.join(tempRoot, 'selection-cli.candidates.json');
  await writeFile(candidatesFile, `${JSON.stringify(technicalCandidates, null, 2)}\n`, 'utf8');
  const result = await runCli([
    'strategy-runtime/overnight-holding/cli/run-selection.mjs',
    '--tradingDate', '2026-03-12',
    '--variant', 'both',
    '--dryRun', 'false',
    '--workspaceRoot', tempRoot,
    '--marketFile', path.join(runtimeRoot, 'fixtures', 'market-regime.good.json'),
    '--candidatesFile', candidatesFile,
    '--llmDecisionFile', path.join(runtimeRoot, 'fixtures', 'selection.agent-decision.sample.json')
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.phase, 'selection');
  assert.equal(result.marketGate.tradable, true);
  assert.equal(result.prefilterSummary?.technicalCandidatesCount, 3);
  assert.ok(result.prefilterSummary?.technicalCandidatesCount <= 50);
  assert.equal(result.riskReview?.decision, 'allow');
  assert.deepEqual(
    result.candidatePool.map((item) => item.symbol),
    ['000858', '300750', '600519']
  );
  assert.deepEqual(
    result.selectedCandidates.leader.map((item) => item.symbol),
    result.candidatePool.map((item) => item.symbol)
  );
  assert.deepEqual(
    result.selectedCandidates.midcore.map((item) => item.symbol),
    result.candidatePool.map((item) => item.symbol)
  );
  assert.equal(result.virtualBuys.length, 2);
  assert.ok(result.messageSummary.includes('隔日持股'));
  assert.ok(result.dataPath.endsWith('.selection.json'));
  assert.ok(result.markdownPath.endsWith('.selection.md'));

  const selectionPackage = JSON.parse(await readFile(result.dataPath, 'utf8'));
  assert.deepEqual(
    selectionPackage.candidatePool.map((item) => item.symbol),
    ['000858', '300750', '600519']
  );
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
