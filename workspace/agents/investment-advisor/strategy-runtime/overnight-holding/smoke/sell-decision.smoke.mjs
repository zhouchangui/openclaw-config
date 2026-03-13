import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(runtimeRoot, '..', '..');
const tempRoot = await mkdtemp(path.join(tmpdir(), 'overnight-sell-'));

const { evaluateSellDecision } = await import(
  pathToFileURL(path.join(runtimeRoot, 'lib', 'sell-decision.mjs')).href
);

const weakOpen = evaluateSellDecision({
  checkpointAt: '09:35',
  snapshot: {
    symbol: '300750',
    lastPriceChangePct: -1.5,
    reclaimedIntradayAverage: false,
    firstPushStrength: 25,
    trendQuality: 20,
    volumeConfirmation: 30
  }
});
assert.equal(weakOpen.action, 'sell_now');
assert.equal(weakOpen.mustExitBefore, '11:30');

const firstPush = evaluateSellDecision({
  checkpointAt: '09:40',
  snapshot: {
    symbol: '600519',
    lastPriceChangePct: 1.2,
    reclaimedIntradayAverage: true,
    firstPushStrength: 61,
    trendQuality: 56,
    volumeConfirmation: 55
  }
});
assert.equal(firstPush.action, 'sell_on_first_push');
assert.equal(firstPush.nextCheckAt, '09:45');

const trendHold = evaluateSellDecision({
  checkpointAt: '09:45',
  snapshot: {
    symbol: '002594',
    lastPriceChangePct: 3.2,
    reclaimedIntradayAverage: true,
    firstPushStrength: 84,
    trendQuality: 90,
    volumeConfirmation: 86
  }
});
assert.equal(trendHold.action, 'hold_and_recheck');
assert.equal(trendHold.nextCheckAt, '09:50');

async function runCli(args) {
  const { stdout } = await execFile('node', args, { cwd: workspaceRoot });
  return JSON.parse(stdout);
}

try {
  const statePath = path.join(tempRoot, 'data', 'overnight-holding', 'state.json');
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify({
    virtualBuys: [],
    currentPositions: [
      { symbol: '300750', name: '龙头候选', openedOn: '2026-03-12', status: 'open' },
      { symbol: '600519', name: '中军候选', openedOn: '2026-03-12', status: 'open' },
      { symbol: '002594', name: '趋势候选', openedOn: '2026-03-12', status: 'open' }
    ],
    selectionJournal: [],
    sellReviewJournal: [],
    stopEvents: [],
    status: { enabled: true, stoppedBy: null, resumeRequired: false }
  }, null, 2)}\n`, 'utf8');

  const result = await runCli([
    'strategy-runtime/overnight-holding/cli/run-sell-review.mjs',
    '--tradingDate', '2026-03-13',
    '--source', 'previous-selection',
    '--dryRun', 'true',
    '--checkpointAt', '09:40',
    '--workspaceRoot', tempRoot,
    '--snapshotsFile', path.join(runtimeRoot, 'fixtures', 'sell-review.sample.json')
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.phase, 'sell-review');
  assert.equal(result.decisions.length, 3);
  assert.equal(result.decisions[0].action, 'sell_now');
  assert.ok(result.messageSummary.includes('卖出复盘'));

  const state = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(state.sellReviewJournal.length, 1);

  const journal = JSON.parse(
    await readFile(path.join(tempRoot, 'data', 'overnight-holding', 'journals', '2026-03-13.sell-review-log.json'), 'utf8')
  );
  assert.equal(journal.length, 3);

  console.log('sell-decision smoke ok');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
