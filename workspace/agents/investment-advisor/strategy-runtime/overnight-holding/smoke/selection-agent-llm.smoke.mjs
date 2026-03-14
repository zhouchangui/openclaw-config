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
const tempRoot = await mkdtemp(path.join(tmpdir(), 'overnight-selection-agent-'));
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
  const { stdout } = await execFile('node', args, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      OPENCLAW_AGENT_FIXTURE_FILE: path.join(runtimeRoot, 'fixtures', 'selection.agent-decision.sample.json')
    }
  });
  return JSON.parse(stdout);
}

try {
  const candidatesFile = path.join(tempRoot, 'selection-agent.candidates.json');
  await writeFile(candidatesFile, `${JSON.stringify(technicalCandidates, null, 2)}\n`, 'utf8');
  const result = await runCli([
    'strategy-runtime/overnight-holding/cli/run-selection.mjs',
    '--tradingDate', '2026-03-12',
    '--variant', 'both',
    '--dryRun', 'false',
    '--workspaceRoot', tempRoot,
    '--marketFile', path.join(runtimeRoot, 'fixtures', 'market-regime.good.json'),
    '--candidatesFile', candidatesFile
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.llmDecisionJson.decisionMode, 'agent');
  assert.equal(result.prefilterSummary?.technicalCandidatesCount, 3);
  assert.ok(result.prefilterSummary?.technicalCandidatesCount <= 50);
  assert.equal(result.riskReview?.decision, 'allow');
  assert.deepEqual(
    result.candidatePool.map((item) => item.symbol),
    ['000858', '300750', '600519']
  );
  assert.equal(result.virtualBuys.length, 2);

  const auditDay = JSON.parse(
    await readFile(path.join(tempRoot, 'data', 'overnight-holding', 'audit', '2026-03-12.json'), 'utf8')
  );
  assert.equal(auditDay.llmDecisionHistory.at(-1).decisionMode, 'agent');
  assert.deepEqual(
    auditDay.candidatePool.map((item) => item.symbol),
    ['000858', '300750', '600519']
  );
  assert.equal(
    auditDay.exceptionsAndFallbacks.some((item) => item.type === 'llm_decision_missing'),
    false
  );

  console.log('selection-agent-llm smoke ok');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
