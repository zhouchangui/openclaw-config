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
const marketFile = path.join(runtimeRoot, 'fixtures', 'market-regime.good.json');
const candidatesFile = path.join(runtimeRoot, 'fixtures', 'candidates.sample.json');

async function runScenario(prefix, llmDecisionJson) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), `${prefix}-`));
  const llmDecisionFile = path.join(tempRoot, 'llm-decision.json');
  await writeFile(llmDecisionFile, `${JSON.stringify(llmDecisionJson, null, 2)}\n`, 'utf8');

  const { stdout } = await execFile('node', [
    'strategy-runtime/overnight-holding/cli/run-selection.mjs',
    '--tradingDate', '2026-03-12',
    '--variant', 'both',
    '--dryRun', 'false',
    '--workspaceRoot', tempRoot,
    '--marketFile', marketFile,
    '--candidatesFile', candidatesFile,
    '--llmDecisionFile', llmDecisionFile
  ], {
    cwd: workspaceRoot
  });

  const result = JSON.parse(stdout);
  const audit = JSON.parse(
    await readFile(path.join(tempRoot, 'data', 'overnight-holding', 'audit', '2026-03-12.json'), 'utf8')
  );
  return { tempRoot, result, audit };
}

const scenarioRoots = [];

try {
  const vetoScenario = await runScenario('overnight-risk-veto', {
    action: 'buy',
    buyList: [
      { symbol: '300750', name: '龙头候选', weightPct: 60, reason: '主线辨识度强。' },
      { symbol: '600519', name: '中军候选', weightPct: 40, reason: '趋势完整。' }
    ],
    rejectedCandidates: [],
    principlesCited: ['主线优先', '评分加权'],
    riskFlags: ['gap_risk_limit_breach'],
    confidence: 'medium',
    decisionMode: 'file'
  });
  scenarioRoots.push(vetoScenario.tempRoot);

  const askUserScenario = await runScenario('overnight-risk-ask-user', {
    action: 'buy',
    buyList: [
      { symbol: '300750', name: '龙头候选', weightPct: 60, reason: '主线辨识度强。' },
      { symbol: '600519', name: '中军候选', weightPct: 40, reason: '趋势完整。' }
    ],
    rejectedCandidates: [],
    principlesCited: ['主线优先', '评分加权'],
    riskFlags: ['overnight_event_risk_requires_confirmation'],
    confidence: 'medium',
    decisionMode: 'file'
  });
  scenarioRoots.push(askUserScenario.tempRoot);

  const allowScenario = await runScenario('overnight-risk-allow', {
    action: 'buy',
    buyList: [
      { symbol: '300750', name: '龙头候选', weightPct: 60, reason: '主线辨识度强。' },
      { symbol: '600519', name: '中军候选', weightPct: 40, reason: '趋势完整。' }
    ],
    rejectedCandidates: [],
    principlesCited: ['主线优先', '评分加权'],
    riskFlags: [],
    confidence: 'medium',
    decisionMode: 'file'
  });
  scenarioRoots.push(allowScenario.tempRoot);

  assert.equal(vetoScenario.result.ok, true);
  assert.equal(vetoScenario.result.riskReview?.decision, 'veto');
  assert.equal(vetoScenario.result.executionLog.length, 1);
  assert.equal(vetoScenario.result.executionLog[0]?.reason, 'blocked_by_risk_review');
  assert.equal(vetoScenario.audit.riskReviewHistory?.at(-1)?.decision, 'veto');

  assert.equal(askUserScenario.result.ok, true);
  assert.equal(askUserScenario.result.riskReview?.decision, 'ask_user_first');
  assert.equal(askUserScenario.result.executionLog.length, 1);
  assert.equal(askUserScenario.result.executionLog[0]?.reason, 'blocked_by_risk_review');
  assert.equal(askUserScenario.audit.riskReviewHistory?.at(-1)?.decision, 'ask_user_first');

  assert.equal(allowScenario.result.ok, true);
  assert.equal(allowScenario.result.riskReview?.decision, 'allow');
  assert.ok(Array.isArray(allowScenario.result.virtualBuys));
  assert.ok(allowScenario.result.virtualBuys.length > 0);
  assert.ok(Array.isArray(allowScenario.result.executionLog));
  assert.ok(allowScenario.result.executionLog.length > 0);
  assert.equal(allowScenario.audit.riskReviewHistory?.at(-1)?.decision, 'allow');

  console.log('final-risk-veto smoke ok');
} finally {
  await Promise.all(scenarioRoots.map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
}
