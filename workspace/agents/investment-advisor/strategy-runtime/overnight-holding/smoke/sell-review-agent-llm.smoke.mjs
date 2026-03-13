import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(runtimeRoot, '..', '..');
const tempRoot = await mkdtemp(path.join(tmpdir(), 'overnight-sell-agent-'));

async function runCli(args) {
  const { stdout } = await execFile('node', args, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      OPENCLAW_AGENT_FIXTURE_FILE: path.join(runtimeRoot, 'fixtures', 'sell-review.agent-decision.sample.json')
    }
  });
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
    '--dryRun', 'false',
    '--checkpointAt', '09:40',
    '--workspaceRoot', tempRoot,
    '--snapshotsFile', path.join(runtimeRoot, 'fixtures', 'sell-review.sample.json')
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.llmDecisionJson.decisionMode, 'agent');

  const auditDay = JSON.parse(
    await readFile(path.join(tempRoot, 'data', 'overnight-holding', 'audit', '2026-03-13.json'), 'utf8')
  );
  assert.equal(auditDay.llmDecisionHistory.at(-1).decisionMode, 'agent');
  assert.equal(
    auditDay.exceptionsAndFallbacks.some((item) => item.type === 'llm_decision_missing'),
    false
  );

  console.log('sell-review-agent-llm smoke ok');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
